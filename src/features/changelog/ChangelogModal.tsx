import { Link } from 'react-router-dom'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import type { ChangelogItem } from './changelog'

interface ChangelogModalProps {
  items: ChangelogItem[]
  onDismiss: () => void
  onDismissForever: () => void
  onClose: () => void
}

export function ChangelogModal({ items, onDismiss, onDismissForever, onClose }: ChangelogModalProps) {
  useEscapeToClose(onClose)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="What's new"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">What's New</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recent changes.</p>
        ) : (
          <ul className="space-y-4 mb-4">
            {items.map((item, index) => (
              <li key={`${item.version}-${item.title}-${index}`} className="border-b border-gray-100 dark:border-gray-800 pb-3 last:border-b-0 last:pb-0">
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.title}</h4>
                {item.body && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.body}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
          <Link
            to="/changelog"
            onClick={onClose}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium"
          >
            View full changelog
          </Link>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onDismissForever}
              className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Don't show again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
