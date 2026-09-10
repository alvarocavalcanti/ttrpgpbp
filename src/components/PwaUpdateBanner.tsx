import { usePwaUpdate, reloadToUpdate } from '../lib/pwaUpdate'

export function PwaUpdateBanner() {
  const status = usePwaUpdate()
  if (status !== 'update-available' && status !== 'updating') return null

  const updating = status === 'updating'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-update-banner"
      className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-100 text-sm flex items-center justify-center gap-3"
    >
      <span>New version available, reload to update.</span>
      {/* Kept mounted while updating so React reuses the DOM node and keyboard
          focus isn't dropped to <body> when it flips to "Updating…". */}
      <button
        type="button"
        onClick={reloadToUpdate}
        aria-disabled={updating}
        className="font-medium underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
      >
        {updating ? 'Updating…' : 'Reload'}
      </button>
    </div>
  )
}
