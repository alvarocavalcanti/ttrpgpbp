import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { hardReload } from './hardReload'

export type PwaUpdateStatus = 'idle' | 'offline-ready' | 'update-available' | 'updating'

// Build id injected at build time (vite.config.ts `define`, issue #601).
export const APP_BUILD = __APP_BUILD__

const KEY_BUILD = 'pwa-build'
const KEY_PENDING = 'pwa-update-pending'
const SESSION_HEAL = 'pwa-heal-attempted'

// Chrome throttles its own service-worker update checks (~24h); a WebAPK
// resumed from background may never re-check, so the app re-checks on resume.
const UPDATE_CHECK_INTERVAL = 60_000

// Storage access wrapped once: private mode / disabled storage must degrade
// the handshake to a no-op, never throw.
function readStore(get: () => string | null): string | null {
  try {
    return get()
  } catch {
    return null
  }
}

function writeStore(set: () => void): void {
  try {
    set()
  } catch {
    // Handshake state is best-effort; the update flow still works without it.
  }
}

// Module-singleton store (same pattern as lib/realtime): the service worker is
// registered once at module load rather than per component, so React StrictMode
// double-mounting can never double-register it.
const listeners = new Set<() => void>()
let status: PwaUpdateStatus = 'idle'

function notify() {
  for (const listener of listeners) listener()
}

function setStatus(next: PwaUpdateStatus) {
  if (next === status) return
  status = next
  notify()
}

const getSnapshot = () => status
const getServerSnapshot: () => PwaUpdateStatus = () => 'idle'

// Boot handshake (issue #601): verifies an update reload actually landed on a
// new build. `stored` is the last confirmed build, `pending` the build an
// update reload was requested from, `current` the build now running.
// Extracted pure so tests can drive every combination without reloading.
export function runBuildHandshake(
  stored: string | null,
  pending: string | null,
  current: string,
  healAttempted: boolean,
  deps: { writeBuild: () => void; clearPending: () => void; heal: () => void },
): void {
  if (!stored) {
    deps.writeBuild()
    return
  }
  if (stored !== current) {
    // A new build is running: the update (or any deploy) landed.
    deps.writeBuild()
    deps.clearPending()
    return
  }
  // Same build as last boot, but an update reload was requested from it: the
  // reload re-served the stale shell and the banner would loop forever.
  if (pending === current && !healAttempted) deps.heal()
}

function bootHandshake() {
  const stored = readStore(() => localStorage.getItem(KEY_BUILD))
  const pending = readStore(() => localStorage.getItem(KEY_PENDING))
  const healAttempted = readStore(() => sessionStorage.getItem(SESSION_HEAL)) !== null
  runBuildHandshake(stored, pending, APP_BUILD, healAttempted, {
    writeBuild: () => writeStore(() => localStorage.setItem(KEY_BUILD, APP_BUILD)),
    clearPending: () => writeStore(() => localStorage.removeItem(KEY_PENDING)),
    heal: () => void selfHeal(),
  })
}

// The update didn't take, or the worker stalled: drop everything the old
// version cached and reload with a cache-busting URL so a pinned container
// can't re-serve the stale shell. Once per app session — if the WebAPK
// container itself is pinned, retrying would just loop (issue #601).
export async function selfHeal(): Promise<void> {
  if (readStore(() => sessionStorage.getItem(SESSION_HEAL)) !== null) return
  writeStore(() => sessionStorage.setItem(SESSION_HEAL, '1'))
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
    const names = await caches.keys()
    await Promise.all(names.map((name) => caches.delete(name)))
  } catch {
    // Even a partial nuke beats the stale shell; the busted reload below
    // still goes to the network.
  }
  hardReload({ bustCache: true })
}

let swRegistration: ServiceWorkerRegistration | undefined
let lastUpdateCheck = 0

function checkForUpdate() {
  if (!swRegistration) return
  const now = Date.now()
  if (now - lastUpdateCheck < UPDATE_CHECK_INTERVAL) return
  lastUpdateCheck = now
  swRegistration.update().catch(() => {
    // Transient network failure: the next resume/online event retries.
  })
}

function register() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  bootHandshake()
  registerSW({
    immediate: true,
    onNeedRefresh: () => setStatus('update-available'),
    onOfflineReady: () => setStatus('offline-ready'),
    onRegisteredSW: (_swScriptUrl, registration) => {
      swRegistration = registration ?? undefined
    },
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  window.addEventListener('online', checkForUpdate)
}
register()

let reloading = false

// Tap the prompt CTA. Do NOT lean on workbox-window's `controlling` event:
// when the PWA has been backgrounded for a while, Chrome on Android may freeze
// the page long enough that the waiting worker is already claimed (so there is
// no `waiting` worker left to skip and `controllerchange` has fired while we
// were frozen) — the tap then silently no-ops and the banner stays put. Fetch a
// fresh registration, post SKIP_WAITING ourselves, and reload the moment the
// new worker reports `activated`. Waiting for the worker's own lifecycle (not
// `controllerchange`, which WebKit doesn't reliably deliver, and not a fixed
// clock) guarantees the reload runs under the new worker: a timeout reload can
// land while the old worker still controls the page, serving the stale shell
// forever (issue #527 — "Updating…" that never updates on Safari). The worker's
// SKIP_WAITING handler (src/sw.ts) does the actual skip.
export function reloadToUpdate() {
  if (reloading) return
  // ponytail: page-lifetime singleton guard, never reset; a fresh load
  // re-imports the module. If a reload were ever blocked forever the banner
  // would stay "Updating…" instead of silently dropping a second tap.
  reloading = true
  setStatus('updating')

  // Remember the build we're leaving: if the next boot runs this same build,
  // the boot handshake knows the update didn't take and self-heals (#601).
  writeStore(() => localStorage.setItem(KEY_PENDING, APP_BUILD))

  let finished = false
  let timer: number | undefined
  const finish = () => {
    if (finished) return
    finished = true
    window.clearTimeout(timer)
    hardReload()
  }

  // Belt and braces: browsers that do fire controllerchange take this path.
  navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true })

  void navigator.serviceWorker.getRegistration().then((reg) => {
    const candidate = reg?.waiting ?? reg?.installing
    if (!candidate) return
    // Already activated while the page was frozen: nothing to wait for.
    if (candidate.state === 'activated') {
      finish()
      return
    }
    candidate.addEventListener('statechange', () => {
      // `redundant` means the install failed — never reload for it; the
      // safety net below covers a genuinely stuck worker.
      if (candidate.state === 'activated') finish()
    })
    candidate.postMessage({ type: 'SKIP_WAITING' })
  })

  // Safety net: if the worker never takes control (frozen page, pending fetch
  // requests, already-claimed worker), nuke caches and reload busted instead
  // of a plain reload, which risks re-serving the stale shell under the old
  // worker and looping the banner (issue #601). `finish` cancels this the
  // moment `controllerchange` arrives, so a slow worker near the 3s mark can't
  // trigger both paths.
  timer = window.setTimeout(() => {
    if (finished) return
    finished = true
    void selfHeal()
  }, 3000)
}

export function usePwaUpdate() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot,
    getServerSnapshot,
  )
}
