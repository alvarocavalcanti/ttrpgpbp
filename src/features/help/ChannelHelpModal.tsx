import { useRef, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { getChannelHelp, type HelpEntry } from './helpContent'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ChannelHelpModalProps {
  onClose: () => void
}

export function ChannelHelpModal({ onClose }: ChannelHelpModalProps) {
  const entries = getChannelHelp()
  const [selected, setSelected] = useState<HelpEntry | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)

  const active = selected ?? entries[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="Channel help"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Channel Help</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-1"
            aria-label="Close channel help"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No channel help topics available.</p>
        ) : (
          <>
            <ul className="space-y-1 mb-4">
              {entries.map((entry) => (
                <li key={entry.slug}>
                  <button
                    type="button"
                    onClick={() => setSelected(entry)}
                    className={`block w-full text-left px-4 py-2.5 text-sm rounded-md transition-colors ${
                      entry.slug === active.slug
                        ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {entry.title}
                  </button>
                </li>
              ))}
            </ul>

            {active && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">{active.title}</h4>
                {active.screenshot && (
                  <img
                    src={active.screenshot}
                    alt={`${active.title} screenshot`}
                    className="w-full max-w-lg mb-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
                  />
                )}
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Markdown>{active.content}</Markdown>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
