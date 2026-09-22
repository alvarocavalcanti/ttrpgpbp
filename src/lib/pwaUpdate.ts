import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { hardReload } from './hardReload'

export type PwaUpdateStatus = 'idle' | 'offline-ready' | 'update-available' | 'updating'

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

function register() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onNeedRefresh: () => setStatus('update-available'),
    onOfflineReady: () => setStatus('offline-ready'),
  })
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
  // requests, already-claimed worker), force the reload anyway so the button
  // can't stay dead. `finish` cancels this the moment `controllerchange`
  // arrives, so a slow worker near the 3s mark can't trigger both paths.
  timer = window.setTimeout(finish, 3000)
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
