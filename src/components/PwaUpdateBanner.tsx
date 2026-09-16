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
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-indigo-200 dark:border-indigo-800 px-4 py-3 max-w-[calc(100vw-2rem)] text-indigo-900 dark:text-indigo-100 text-sm"
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
