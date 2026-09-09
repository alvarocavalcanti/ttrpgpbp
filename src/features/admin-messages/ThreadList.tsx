import { useState } from 'react'
import type { Thread } from './types'
import { useAdminThreads, type CreateThreadInput } from './useAdminThreads'
import { useMessageRecipients } from './useMessageRecipients'
import { Avatar } from '../../components/Avatar'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useToast } from '../../contexts/ToastContext'

export function ThreadList({ selectedThreadId, onSelectThread }: { selectedThreadId?: string, onSelectThread: (t: Thread) => void }) {
  const { threads, loading, hasMore, loadMore, refetch, error, createThread } = useAdminThreads()
  const { isServerAdmin } = useIsServerAdmin()
  const [showNewModal, setShowNewModal] = useState(false)

  if (loading && threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-white dark:bg-gray-800">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

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
        {loading && threads.length > 0 && (
          <div className="flex justify-center p-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 dark:border-indigo-500" aria-label="Loading"></div>
          </div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load conversations.</span>
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
                  <div className="flex items-center gap-2">
                    {thread.type === 'announcement' && (
                      <span
                        className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      >
                        {thread.audience === 'all_users' ? 'All users' : 'GMs'}
                      </span>
                    )}
                    <p className={`text-sm truncate ${thread.unread ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                      {thread.type === 'announcement' ? thread.subject : 'Direct Message'}
                    </p>
                  </div>
                </div>
                {thread.unread && <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0 mt-2"></div>}
              </button>
            ))}
          </div>
        )}
        {hasMore && (
          <button type="button" onClick={() => loadMore()} className="w-full p-3 text-center text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
                Loading...
              </>
            ) : 'Load more'}
          </button>
        )}
      </div>

      {showNewModal && <NewThreadModal onClose={() => setShowNewModal(false)} onCreated={onSelectThread} isServerAdmin={isServerAdmin} createThread={createThread} />}
    </div>
  )
}

function NewThreadModal({ onClose, onCreated, isServerAdmin, createThread }: { onClose: () => void, onCreated: (t: Thread) => void, isServerAdmin: boolean, createThread: (input: CreateThreadInput) => Promise<Thread | 'committed' | null> }) {
  const [type, setType] = useState<'announcement' | 'dm'>(isServerAdmin ? 'announcement' : 'dm')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  // Announcements default to the GM-only audience.
  const [audience, setAudience] = useState<'gms' | 'all_users'>('gms')
  const [gmId, setGmId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useToast()
  const { recipients, loading: recipientsLoading, error: recipientsError, refetch: refetchRecipients } = useMessageRecipients(isServerAdmin)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const thread = await createThread({
      type,
      subject,
      content,
      audience: type === 'announcement' ? audience : null,
      gmId: type === 'dm' && isServerAdmin ? gmId : null
    })
    // On failure the hook has already surfaced a toast; stay in the modal so
    // the user can retry without retyping.
    if (!thread) {
      setSubmitting(false)
      return
    }
    if (thread === 'committed') {
      // The conversation exists (the list refreshes via realtime) but its
      // full row isn't available to select right away.
      addToast('Message sent. The conversation will appear in the list.', 'success')
      onClose()
      return
    }
    onCreated(thread)
    onClose()
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
                <select value={type} onChange={e => setType(e.target.value as 'announcement' | 'dm')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2">
                  <option value="announcement">Announcement</option>
                  <option value="dm">Direct Message</option>
                </select>
              </div>
            )}

            {type === 'announcement' ? (
              <>
                {isServerAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Audience</label>
                    <select value={audience} onChange={e => setAudience(e.target.value as 'gms' | 'all_users')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white">
                      <option value="gms">GMs only</option>
                      <option value="all_users">All users</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                  <input required maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white" />
                </div>
              </>
            ) : (
              isServerAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To user</label>
                  {recipientsError ? (
                    <div className="flex justify-between items-center text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded px-3 py-2">
                      <span>Couldn't load the recipient list.</span>
                      <button type="button" onClick={() => refetchRecipients()} className="font-semibold hover:underline">Retry</button>
                    </div>
                  ) : (
                    <select required value={gmId} onChange={e => setGmId(e.target.value)} disabled={recipientsLoading} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white">
                      <option value="">{recipientsLoading ? 'Loading users...' : 'Select user...'}</option>
                      {recipients.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
                    </select>
                  )}
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
            <button
              type="submit"
              disabled={submitting || (type === 'dm' && isServerAdmin && (!!recipientsError || !gmId))}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
