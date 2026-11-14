import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useRealtimeStatus } from '../lib/realtime'
import { isPrerender } from '../lib/automation'

// Connection status card for the floating banner host (issue #620): the old
// full-width in-flow strip pushed every page down and made the channel route
// scrollable, so it shares the overlay card styling of PwaUpdateBanner.
//
// Issue #825: this is the single global surface for connection state. It names
// the saved-content behavior, and a Details expander carries the long
// explanation so the timeline only needs one thin staleness line.
export function RealtimeBanner() {
  const status = useRealtimeStatus()
  const [detailsOpen, setDetailsOpen] = useState(false)
  // The card renders nothing while connected but stays mounted, so the
  // expander state must be reset explicitly or it reopens pre-expanded after
  // the next drop.
  useEffect(() => {
    if (status === 'Connected') setDetailsOpen(false)
  }, [status])

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
      className="pointer-events-auto flex items-start gap-3 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-amber-200 dark:border-amber-800 px-4 py-3 max-w-[calc(100vw-2rem)] text-amber-900 dark:text-amber-100 text-sm"
    >
      {offline ? (
        <WifiOff aria-hidden="true" className="w-5 h-5 flex-shrink-0 mt-0.5" />
      ) : (
        <RefreshCw aria-hidden="true" className="w-5 h-5 flex-shrink-0 mt-0.5 motion-safe:animate-spin" />
      )}
      <div className="min-w-0">
        <p>
          {offline
            ? "You're offline — showing saved content. New messages arrive when you reconnect."
            : "Reconnecting — new messages arrive when you're back."}
        </p>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="realtime-banner-details"
          onClick={() => setDetailsOpen(open => !open)}
          className="mt-1 inline-flex min-h-11 items-center font-medium underline focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
        >
          {detailsOpen ? 'Hide details' : 'Details'}
        </button>
        {detailsOpen && (
          <ul id="realtime-banner-details" className="mt-1 space-y-1 text-xs text-amber-800 dark:text-amber-200">
            <li>Your channel list, rooms, and recent messages are saved on this device after you open them once.</li>
            <li>New messages, edits, and reactions sync when you reconnect.</li>
            <li>Sending needs a connection. A message sent while offline shows Retry — your text stays in the composer.</li>
          </ul>
        )}
      </div>
    </div>
  )
}
