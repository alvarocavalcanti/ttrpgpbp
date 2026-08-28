import { useState, useEffect, useRef } from 'react'
import type { Thread } from './types'
import { useAdminMessages } from './useAdminMessages'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../../components/Avatar'
import { Markdown } from '../../components/Markdown'
import { useAuth } from '../auth/useAuth'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'

export function ThreadDetail({ thread, onBack }: { thread: Thread, onBack: () => void }) {
  const { messages, loading, hasMore, loadMore, refetch, error } = useAdminMessages(thread.id)
  const { user } = useAuth()
  const { isServerAdmin } = useIsServerAdmin()
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Set to the container's height before a load-more prepend; the effect that
  // normally scrolls to the bottom instead restores the viewport on that page.
  const loadMoreHeightRef = useRef<number | null>(null)

  useEffect(() => {
    if (!thread.id) return
    supabase.rpc('mark_admin_thread_read', { p_thread_id: thread.id })
      .then(() => {}, () => {})
  }, [thread.id, messages.length])

  useEffect(() => {
    if (loadMoreHeightRef.current !== null) {
      // Older messages were prepended; keep the viewport on the previously
      // visible content instead of jumping to the bottom.
      const el = scrollRef.current
      if (el) el.scrollTop += el.scrollHeight - loadMoreHeightRef.current
      loadMoreHeightRef.current = null
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLoadMore = async () => {
    const el = scrollRef.current
    if (el) loadMoreHeightRef.current = el.scrollHeight
    await loadMore()
  }

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyContent.trim()) return
    setSubmitting(true)
    setReplyError(null)
    const { error } = await supabase.from('admin_messages').insert({
      thread_id: thread.id,
      content: replyContent.trim(),
      sender_id: user!.id
    })
    if (error) {
      setReplyError("Couldn't send your reply. Tap Send to retry.")
    } else {
      setReplyContent('')
    }
    setSubmitting(false)
  }

  const handleDeleteThread = async () => {
    if (!confirm('Are you sure you want to delete this entire thread?')) return
    await supabase.from('admin_threads').delete().eq('id', thread.id)
    onBack()
  }

  const handleDeleteMsg = async (msgId: string) => {
    if (!confirm('Delete this message?')) return
    await supabase.from('admin_messages').update({ is_deleted: true, content: '' }).eq('id', msgId)
  }

  const title = thread.type === 'announcement' ? thread.subject : (isServerAdmin ? thread.gm?.display_name || 'GM' : 'Server Admin')

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button type="button" onClick={onBack} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
          <div className="text-sm text-gray-500">{thread.type === 'announcement' ? 'Announcement' : 'Direct Message'}</div>
        </div>
        {isServerAdmin && (
          <button type="button" onClick={handleDeleteThread} className="text-red-500 hover:text-red-700 p-2" title="Delete Thread">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load messages.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold hover:underline">Retry</button>
          </div>
        )}
        {hasMore && (
          <button type="button" onClick={() => void handleLoadMore()} className="w-full p-2 text-center text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700">
            {loading ? 'Loading...' : 'Load earlier messages'}
          </button>
        )}
        {loading && messages.length === 0 ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender_id === user?.id ? 'flex-row-reverse' : ''}`}>
              <Avatar src={msg.sender?.avatar_url || undefined} className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className={`flex flex-col max-w-[85%] ${msg.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{msg.sender?.display_name || 'User'}</span>
                  <span className="text-xs text-gray-500">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className={`px-4 py-2 rounded-2xl ${msg.is_deleted ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 italic border border-gray-200 dark:border-gray-600' : (msg.sender_id === user?.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100')}`}>
                  {msg.is_deleted ? '[Message deleted]' : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-p:my-1 break-words">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  )}
                </div>
                {!msg.is_deleted && (msg.sender_id === user?.id || isServerAdmin) && (
                  <button type="button" onClick={() => handleDeleteMsg(msg.id)} className="text-xs text-gray-400 hover:text-red-500 mt-1 px-1">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        {replyError && (
          <div className="mb-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded px-3 py-2" role="alert">
            {replyError}
          </div>
        )}
        <form onSubmit={handleReply} className="flex gap-2">
          <textarea
            value={replyContent}
            onChange={e => setReplyContent(e.target.value)}
            placeholder="Type a reply..."
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none h-10 min-h-[40px] max-h-32"
            rows={1}
            maxLength={2000}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleReply(e)
              }
            }}
          />
          <button
            type="submit"
            disabled={!replyContent.trim() || submitting}
            className="flex-shrink-0 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
