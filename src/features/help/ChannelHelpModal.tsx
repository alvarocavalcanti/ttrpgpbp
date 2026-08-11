import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getChannelHelp, type HelpEntry } from './helpContent'

interface ChannelHelpModalProps {
  onClose: () => void
}

export function ChannelHelpModal({ onClose }: ChannelHelpModalProps) {
  const entries = getChannelHelp()
  const [selected, setSelected] = useState<HelpEntry | null>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const active = selected ?? entries[0]

  return (
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClose()
          e.preventDefault()
        }
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Channel help"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Channel Help</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close channel help"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">No channel help topics available.</p>
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
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {entry.title}
                  </button>
                </li>
              ))}
            </ul>

            {active && (
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-base font-semibold text-gray-900 mb-3">{active.title}</h4>
                {active.screenshot && (
                  <img
                    src={active.screenshot}
                    alt={`${active.title} screenshot`}
                    className="w-full max-w-lg mb-4 rounded-lg border border-gray-200 shadow-sm"
                  />
                )}
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
