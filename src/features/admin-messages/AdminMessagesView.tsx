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
    // Bounded to the viewport below the app nav so the list/detail scroll
    // internally: the nav and the thread header stay put instead of scrolling
    // away with the document. 4.5rem is AppNav's single-row height
    // (`p-4` = 2rem + a 2.5rem row); the logo truncates rather than wraps, so
    // the height is constant across viewports.
    <div className="h-[calc(100dvh-4.5rem)] w-full flex flex-col md:flex-row overflow-hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
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
