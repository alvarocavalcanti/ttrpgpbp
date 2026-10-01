import { useRealtimeStatus } from '../lib/realtime'
import { isPrerender } from '../lib/automation'

// Connection status card for the floating banner host (issue #620): the old
// full-width in-flow strip pushed every page down and made the channel route
// scrollable, so it shares the overlay card styling of PwaUpdateBanner.
export function RealtimeBanner() {
  const status = useRealtimeStatus()
  // The status starts Connected and only turns Offline once the effect runs, so
  // a prerender snapshot could capture the banner while hydration's first render
  // does not. Keep it out of the prerender (issue #643).
  if (isPrerender()) return null
  if (status === 'Connected') return null

  const offline = status === 'Offline'
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="realtime-banner"
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-amber-200 dark:border-amber-800 px-4 py-3 max-w-[calc(100vw-2rem)] text-amber-900 dark:text-amber-100 text-sm"
    >
      {offline ? 'You are offline. Realtime updates will resume when you reconnect.' : 'Reconnecting to realtime updates...'}
    </div>
  )
}
