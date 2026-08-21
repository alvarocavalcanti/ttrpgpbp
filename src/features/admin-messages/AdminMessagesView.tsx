import { useState } from 'react'
import { ThreadList } from './ThreadList'
import { ThreadDetail } from './ThreadDetail'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useIsActiveGM } from '../../hooks/useIsActiveGM'
import { NotFound } from '../../App'
import type { Thread } from './types'

export function AdminMessagesView() {
  const { isServerAdmin } = useIsServerAdmin()
  const { isActiveGM, loading } = useIsActiveGM()
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!isServerAdmin && !isActiveGM) {
    return <NotFound />
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className={`md:w-1/3 md:flex md:flex-col border-r border-gray-200 dark:border-gray-800 ${selectedThread ? 'hidden md:flex' : 'flex flex-1'}`}>
        <ThreadList selectedThreadId={selectedThread?.id} onSelectThread={setSelectedThread} />
      </div>
      
      <div className={`md:flex-1 md:flex md:flex-col ${selectedThread ? 'flex flex-1' : 'hidden md:flex bg-gray-50 dark:bg-gray-900 items-center justify-center'}`}>
        {selectedThread ? (
          <ThreadDetail thread={selectedThread} onBack={() => setSelectedThread(null)} />
        ) : (
          <div className="text-gray-500 dark:text-gray-400">Select a message thread</div>
        )}
      </div>
    </div>
  )
}
