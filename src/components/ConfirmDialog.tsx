import { useEffect, useRef } from 'react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

interface ConfirmDialogProps {
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Styled replacement for window.confirm: centered in-app dialog with a
// danger-styled confirm button. Closes on backdrop tap or Escape. Focus
// starts on Cancel (safe choice for destructive confirmations) and stays
// trapped inside the dialog while it is open.
export function ConfirmDialog({ title, description, confirmLabel = 'Delete', onConfirm, onClose }: ConfirmDialogProps) {
  useEscapeToClose(onClose)
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title} onKeyDown={trapTab}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80" aria-hidden="true" onClick={onClose}></div>
        <div ref={panelRef} className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>
          )}
          <div className="mt-6 flex justify-end space-x-3">
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
