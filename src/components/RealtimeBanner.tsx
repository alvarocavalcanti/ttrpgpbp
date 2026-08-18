import { useRealtimeStatus } from '../lib/realtime'

export function RealtimeBanner() {
  const status = useRealtimeStatus()
  if (status === 'Connected') return null

  const offline = status === 'Offline'
  return (
    <div
      className="px-4 py-2 bg-amber-100 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm text-center"
      role="status"
      data-testid="realtime-banner"
    >
      {offline ? 'You are offline. Realtime updates will resume when you reconnect.' : 'Reconnecting to realtime updates...'}
    </div>
  )
}
