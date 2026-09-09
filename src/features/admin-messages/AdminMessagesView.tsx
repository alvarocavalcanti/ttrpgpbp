import { useState } from 'react'
import { ThreadList } from './ThreadList'
import { ThreadDetail } from './ThreadDetail'
import type { Thread } from './types'

// Available to every signed-in user: GMs and players alike can read
// announcements addressed to them and open a support DM with the server
// admin. RLS scopes what each role can see.
export function AdminMessagesView() {
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className={`md:w-1/3 w-full md:flex md:flex-col border-r border-gray-200 dark:border-gray-800 ${selectedThread ? 'hidden md:flex' : 'flex flex-1'}`}>
        <ThreadList selectedThreadId={selectedThread?.id} onSelectThread={setSelectedThread} />
      </div>

      <div className={`md:flex-1 w-full md:flex md:flex-col ${selectedThread ? 'flex flex-1' : 'hidden md:flex bg-gray-50 dark:bg-gray-900 items-center justify-center'}`}>
        {selectedThread ? (
          <ThreadDetail thread={selectedThread} onBack={() => setSelectedThread(null)} />
        ) : (
          <div className="text-gray-500 dark:text-gray-400">Select a message thread</div>
        )}
      </div>
    </div>
  )
}
