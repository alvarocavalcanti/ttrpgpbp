import { useState, useEffect } from 'react'
import type { Thread } from './types'
import { useAdminThreads } from './useAdminThreads'
import { Avatar } from '../../components/Avatar'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { supabase } from '../../lib/supabase'

export function ThreadList({ selectedThreadId, onSelectThread }: { selectedThreadId?: string, onSelectThread: (t: Thread) => void }) {
  const { threads, loading, hasMore, loadMore, refetch, error } = useAdminThreads()
  const { isServerAdmin } = useIsServerAdmin()
  const [showNewModal, setShowNewModal] = useState(false)

  if (loading && threads.length === 0) return <div className="p-4 w-full text-gray-500">Loading threads...</div>

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
        {isServerAdmin ? (
          <button type="button" onClick={() => setShowNewModal(true)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
            New
          </button>
        ) : (
          <button type="button" onClick={() => setShowNewModal(true)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
            Message Admin
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load messages.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold hover:underline">Retry</button>
          </div>
        )}
        {threads.length === 0 && !error ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No messages yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {threads.map(thread => (
              <button type="button"
                key={thread.id}
                onClick={() => onSelectThread(thread)}
                className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 ${selectedThreadId === thread.id ? 'bg-indigo-50 dark:bg-gray-700/50' : ''}`}
              >
                <div className="flex-shrink-0 mt-1">
                  {thread.type === 'announcement' ? (
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                    </div>
                  ) : (
                    <Avatar 
                      src={isServerAdmin ? (thread.gm?.avatar_url || undefined) : (thread.creator.avatar_url || undefined)} 
                      alt="" 
                      className="w-10 h-10 rounded-full" 
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`text-sm truncate ${thread.unread ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                      {thread.type === 'announcement' ? 'Announcement' : (isServerAdmin ? thread.gm?.display_name || 'GM' : 'Server Admin')}
                    </h3>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className={`text-sm truncate ${thread.unread ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    {thread.type === 'announcement' ? thread.subject : 'Direct Message'}
                  </p>
                </div>
                {thread.unread && <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0 mt-2"></div>}
              </button>
            ))}
          </div>
        )}
        {hasMore && (
          <button type="button" onClick={() => loadMore()} className="w-full p-3 text-center text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700">
            {loading ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>

      {showNewModal && <NewThreadModal onClose={() => setShowNewModal(false)} onCreated={onSelectThread} isServerAdmin={isServerAdmin} />}
    </div>
  )
}

function NewThreadModal({ onClose, onCreated, isServerAdmin }: { onClose: () => void, onCreated: (t: Thread) => void, isServerAdmin: boolean }) {
  const [type, setType] = useState<'announcement' | 'dm'>(isServerAdmin ? 'announcement' : 'dm')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [gmId, setGmId] = useState('')
  const [gms, setGms] = useState<{id: string, display_name: string}[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isServerAdmin) {
      supabase.rpc('admin_list_active_gms').then(({ data }) => setGms(data || []))
    }
  }, [isServerAdmin])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    
    // Create thread
    const currentUserId = (await supabase.auth.getUser()).data.user!.id
    const { data: threadData, error: threadError } = await supabase.from('admin_threads').insert({
      type,
      subject: type === 'announcement' ? subject : null,
      gm_id: type === 'dm' && isServerAdmin ? gmId : (type === 'dm' ? currentUserId : null),
      created_by: currentUserId
    }).select().single()

    if (threadError || !threadData) {
      alert('Failed to create thread')
      setSubmitting(false)
      return
    }

    // Create message
    const { error: msgError } = await supabase.from('admin_messages').insert({
      thread_id: threadData.id,
      content,
      sender_id: (await supabase.auth.getUser()).data.user!.id
    })

    if (msgError) {
      alert('Failed to send message')
    } else {
      // Mark the newly created thread as read for the creator so they don't see it as unread.
      // Non-critical: failure only means the creator sees a spurious unread dot temporarily.
      const { error: readError } = await supabase.rpc('mark_admin_thread_read', { p_thread_id: threadData.id })
      if (readError) console.error('Failed to mark new thread as read:', readError)

      // Force fetch the full thread with creator details to pass back
      const { data: fullThread } = await supabase.from('admin_threads').select('*, creator:profiles!admin_threads_created_by_fkey(display_name, avatar_url), gm:profiles!admin_threads_gm_id_fkey(display_name, avatar_url)').eq('id', threadData.id).single()
      if (fullThread) onCreated({
        ...fullThread, 
        creator: Array.isArray(fullThread.creator) ? fullThread.creator[0] : fullThread.creator,
        gm: fullThread.gm ? (Array.isArray(fullThread.gm) ? fullThread.gm[0] : fullThread.gm) : undefined
      } as Thread)
      onClose()
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[90vh]">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Message</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-500">&times;</button>
          </div>
          
          <div className="p-4 overflow-y-auto space-y-4">
            {isServerAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select value={type} onChange={e => setType(e.target.value as any)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2">
                  <option value="announcement">Announcement</option>
                  <option value="dm">Direct Message</option>
                </select>
              </div>
            )}

            {type === 'announcement' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                <input required maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white" />
              </div>
            ) : (
              isServerAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To GM</label>
                  <select required value={gmId} onChange={e => setGmId(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2">
                    <option value="">Select GM...</option>
                    {gms.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
                  </select>
                </div>
              )
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
              <textarea required maxLength={2000} rows={5} value={content} onChange={e => setContent(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white resize-none" />
            </div>
          </div>
          
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
