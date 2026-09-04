import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

export type PwaUpdateStatus = 'idle' | 'offline-ready' | 'update-available'

// Module-singleton store (same pattern as lib/realtime): the service worker is
// registered once at module load rather than per component, so React StrictMode
// double-mounting can never double-register it.
const listeners = new Set<() => void>()
let status: PwaUpdateStatus = 'idle'
let reload: () => Promise<void> = async () => {}

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
  reload = registerSW({
    immediate: true,
    onNeedRefresh: () => setStatus('update-available'),
    onOfflineReady: () => setStatus('offline-ready'),
  })
}
register()

// Tap the prompt CTA: skip the waiting worker and let the page reload with the
// fresh shell. The worker's SKIP_WAITING handler (src/sw.ts) does the skip.
export function reloadToUpdate() {
  void reload()
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