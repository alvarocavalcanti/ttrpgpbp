import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

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
// fresh registration, post SKIP_WAITING ourselves, reload on `controllerchange`,
// and force a reload if that round-trip stalls. The worker's SKIP_WAITING
// handler (src/sw.ts) does the actual skip.
export function reloadToUpdate() {
  if (reloading) return
  // ponytail: page-lifetime singleton guard, never reset; a fresh load
  // re-imports the module. If a reload were ever blocked forever the banner
  // would stay "Updating…" instead of silently dropping a second tap.
  reloading = true
  setStatus('updating')

  let timer: number | undefined
  const finish = () => {
    window.clearTimeout(timer)
    window.location.reload()
  }

  void navigator.serviceWorker.getRegistration().then((reg) => {
    const waiting = reg?.waiting ?? reg?.installing
    waiting?.postMessage({ type: 'SKIP_WAITING' })
  })

  navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true })

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
