import { usePwaUpdate, reloadToUpdate } from '../lib/pwaUpdate'

export function PwaUpdateBanner() {
  const status = usePwaUpdate()
  if (status !== 'update-available') return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-update-banner"
      className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-100 text-sm flex items-center justify-center gap-3"
    >
      <span>New version available, reload to update.</span>
      <button
        type="button"
        onClick={reloadToUpdate}
        className="font-medium underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
      >
        Reload
      </button>
    </div>
  )
}