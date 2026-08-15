import { useEffect, useRef } from 'react'
import { useSearch } from './useSearch'
import ReactMarkdown from 'react-markdown'

interface SearchModalProps {
  channelId: string
  onClose: () => void
  onJumpToMessage?: (messageId: string) => void
}

export function SearchModal({ channelId, onClose, onJumpToMessage }: SearchModalProps) {
  const { searchTerm, setSearchTerm, results, loading, error } = useSearch(channelId)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus()
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleResultClick = (messageId: string) => {
    if (onJumpToMessage) {
      onJumpToMessage(messageId)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full h-[80vh] flex flex-col">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" id="modal-title">
                Search Messages
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="bg-white dark:bg-gray-800 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                ref={inputRef}
                className="bg-white dark:bg-gray-800 focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 border"
                placeholder="Search by keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4">
            {loading && results.length === 0 ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
              </div>
            ) : error ? (
              <div className="text-center text-red-600 dark:text-red-400 py-8">
                An error occurred while searching. Please try again.
              </div>
            ) : searchTerm && results.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                No messages found matching "{searchTerm}"
              </div>
            ) : results.length > 0 ? (
              <ul className="space-y-4">
                {results.map((message) => (
                  <li
                    key={message.id}
                    role="button"
                    tabIndex={0}
                    className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900"
                    onClick={() => handleResultClick(message.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleResultClick(message.id)
                        e.preventDefault()
                      }
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {message.npc_name || message.sender?.display_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 prose prose-sm max-w-none prose-p:my-0">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8 h-full flex items-center justify-center">
                Enter a search term to find messages in this channel
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
