import { useEffect, useMemo, useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { Markdown } from '../../components/Markdown'
import { SignedImg } from '../../components/SignedImg'
import { useAdminChannelMessages, type AdminChannelMessage } from './useAdminChannelMessages'

// Pure link sanitizer; hoisted so ReactMarkdown gets a stable reference.
// Mirrors the chat urlTransform minus the dice/check/user chips, which are
// interactive player affordances with no meaning in a read-only admin view.
function urlTransform(url: string): string {
  const protocols = ['http', 'https', 'mailto', 'tel']
  try {
    const parsed = new URL(url)
    if (protocols.includes(parsed.protocol.replace(':', ''))) return url
  } catch {
    // Relative URLs are fine
    if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) return url
    // Bare private-bucket object paths ({channel_id}/{folder}/{uuid}.jpg) are
    // allowed so message images survive into the markdown img renderer, which
    // exchanges them for signed URLs. No scheme, so nothing to sanitize.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(url)) return url
  }
  return ''
}

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function senderLabel(message: AdminChannelMessage): string {
  return message.sender_display_name || message.sender_character_name || 'Unknown'
}

// Read-only channel view for the server admin console (issue #550). No
// composer, no edit/delete/reaction/reply/report affordances: admins are not
// channel members, so even a hand-crafted write would fail RLS, and the UI
// offers no path to attempt one.
export function AdminChannelView() {
  const { id } = useParams<{ id: string }>()
  const { isServerAdmin, loading: adminLoading } = useIsServerAdmin()
  // Non-admins issue no RPC: without a channel id the hook stays idle.
  const { messages, loading, error, hasMore, loadingOlder, loadOlder, refetch, channel, channelLoading, channelError, channelMissing, refetchChannel, members, membersLoading, membersError, refetchMembers } =
    useAdminChannelMessages(isServerAdmin ? id : undefined)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Set to the container's height before a load-older prepend; the list then
  // keeps the viewport on the previously visible content instead of jumping.
  const loadOlderHeightRef = useRef<number | null>(null)

  // Recreate renderers once: nothing the closures capture ever changes, so
  // ReactMarkdown keeps a stable `components` reference and never re-parses.
  const renderers = useMemo(() => ({
    img: ({ node: _node, src, alt, ...props }: React.ComponentProps<'img'> & { node?: unknown }) => (
      <SignedImg
        src={src}
        alt={alt || 'Image'}
        className="max-w-full h-auto rounded-lg shadow-sm my-2 object-contain max-h-96"
        loading="lazy"
        referrerPolicy="no-referrer"
        reserveBox
        {...props}
      />
    ),
  }), [])

  useEffect(() => {
    if (loadOlderHeightRef.current !== null) {
      const el = scrollRef.current
      if (el) el.scrollTop += el.scrollHeight - loadOlderHeightRef.current
      loadOlderHeightRef.current = null
    }
  }, [messages])

  const handleLoadOlder = async () => {
    const el = scrollRef.current
    if (el) loadOlderHeightRef.current = el.scrollHeight
    await loadOlder()
  }

  if (!adminLoading && !isServerAdmin) {
    return <Navigate to="/" replace />
  }

  if (adminLoading || channelLoading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>
  }

  if (channelError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">Couldn't load this channel.</p>
        <button type="button" onClick={() => refetchChannel()} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Retry</button>
        <div className="mt-4"><Link to="/admin" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Back to admin</Link></div>
      </div>
    )
  }

  if (channelMissing || !channel) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">Channel not found.</p>
        <p className="text-sm text-gray-500 mb-4">It may have been deleted or archived.</p>
        <Link to="/admin" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Back to admin</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Link to="/admin" aria-label="Back to admin" className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{channel.name}</h2>
            <div className="text-sm text-gray-500">{channel.game_system} · {channel.member_count} members</div>
          </div>
        </div>
        <div role="status" className="mt-3 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 rounded px-3 py-2">
          Read-only admin view. You can review messages here, but you can't send any.
        </div>
        {/* Channel roster (issue #556): collapsed by default so the messages
        keep the viewport; the count comes from the channel header so it is
        stable while the roster loads. Blocked members stay listed (badged)
        for moderation context. */}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
            Players ({channel.member_count})
          </summary>
          <div className="mt-2">
            {membersLoading ? (
              <p className="text-gray-500">Loading players…</p>
            ) : membersError ? (
              <div className="flex justify-between items-center text-red-700 dark:text-red-300">
                <span>Couldn't load players.</span>
                <button type="button" onClick={() => refetchMembers()} className="font-semibold hover:underline">Retry</button>
              </div>
            ) : members.length === 0 ? (
              <p className="text-gray-500">No players yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {members.map(member => (
                  <li key={member.user_id} className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{member.character_name}</span>
                    {member.display_name && member.display_name !== member.character_name && (
                      <span className="text-gray-500 truncate">{member.display_name}</span>
                    )}
                    {member.user_id === channel.gm_id && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">GM</span>
                    )}
                    {member.is_active_player && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Active player</span>
                    )}
                    {member.is_blocked && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">Blocked</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>

      <div ref={scrollRef} className="flex-1 w-full overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load messages.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold hover:underline">Retry</button>
          </div>
        )}
        {hasMore && (
          <button type="button" onClick={() => void handleLoadOlder()} disabled={loadingOlder} className="w-full p-2 text-center text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            {loadingOlder ? 'Loading...' : 'Load earlier messages'}
          </button>
        )}
        {loading && messages.length === 0 ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500">
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">No messages yet.</p>
            <p className="text-sm">Nothing has been posted in this channel.</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="flex gap-3">
              <div className="flex flex-col w-full min-w-0 max-w-[85%] items-start">
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{senderLabel(msg)}</span>
                  <span className="text-xs text-gray-500">{formatTimestamp(msg.created_at)}</span>
                  {msg.type !== 'regular' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{msg.type}</span>
                  )}
                  {msg.npc_name && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">NPC: {msg.npc_name}</span>
                  )}
                  {msg.whisper_to && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">Whisper</span>
                  )}
                  {msg.is_deleted && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">Deleted</span>
                  )}
                </div>
                <div className={`w-full px-4 py-2 rounded-2xl ${msg.is_deleted ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 italic border border-gray-200 dark:border-gray-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}>
                  {/* Deleted messages keep their content: user deletes flip
                  is_deleted without clearing content, and this view exists for
                  safety review. The Deleted badge above marks them. */}
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-p:my-1 break-words">
                    <Markdown components={renderers} urlTransform={urlTransform}>{msg.content}</Markdown>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
