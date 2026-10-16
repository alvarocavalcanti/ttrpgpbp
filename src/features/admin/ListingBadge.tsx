import type { AdminChannel } from './useAdminData'

// #674: a channel's listing state in one place, so neither admin view can show
// an admin-taken-down listing as merely private — that is the difference between
// "the GM chose to keep this private" and "an admin removed it".
export function ListingBadge({ channel }: { channel: AdminChannel }) {
  if (channel.listing_takedown_at) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
        Taken down
      </span>
    )
  }
  if (channel.join_mode !== 'approval') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
        Private
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
        Listed
      </span>
      {channel.gm_id === null && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
          Orphaned
        </span>
      )}
    </span>
  )
}
