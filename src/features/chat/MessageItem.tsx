import { useState, useRef, useEffect, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { linkifyDice } from '../dice/parser'
import { getSystemAttributes, clampModifier } from '../../game-systems'
import { EmojiPicker } from './EmojiPicker'
import type { ReactionSummary } from './useMessages'
import type { ChatMessage } from './types'

type Message = ChatMessage

interface MessageItemProps {
  message: Message
  currentUserId: string | undefined
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string, replyToId?: string) => void
  isHighlighted?: boolean
  members?: Array<{ user_id: string; character_name: string; attributes?: any }>
  gameSystem?: string
  reactions?: ReactionSummary[]
  onToggleReaction?: (messageId: string, emoji: string) => void
  onReply?: (message: Message) => void
  onJumpToMessage?: (messageId: string) => void
  onXCard?: (messageId: string) => void
}

function snippet(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .trim()
}

function formatTimestamp(createdAt: string): string {
  const d = new Date(createdAt)
  const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60)
  return diffHours > 20
    ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Pure link sanitizer; hoisted so ReactMarkdown gets a stable reference.
function urlTransform(url: string): string {
  if (url.startsWith('dice:') || url.startsWith('check:') || url.startsWith('user:')) return url
  // Basic sanitization for other URLs, matching react-markdown defaults roughly
  const protocols = ['http', 'https', 'mailto', 'tel']
  try {
    const parsed = new URL(url)
    if (protocols.includes(parsed.protocol.replace(':', ''))) return url
  } catch {
    // Relative URLs are fine
    if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) return url
  }
  return ''
}

export const MessageItem = memo(function MessageItem({ message, currentUserId, isGM, onEdit, onDelete, onRollDice, isHighlighted, members, gameSystem = 'none', reactions, onToggleReaction, onReply, onJumpToMessage, onXCard }: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  const senderName = message.npc_name || members?.find(m => m.user_id === message.sender_id)?.character_name || message.sender?.display_name
  const replySenderName = message.reply?.sender_id ? members?.find(m => m.user_id === message.reply?.sender_id)?.character_name : undefined

  useEffect(() => {
    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  const isMe = message.sender_id === currentUserId
  const isWhisper = !!message.whisper_to
  const isScene = message.type === 'scene'
  const isSystem = message.type === 'system'
  const isNpc = message.type === 'npc'

  // Check 15 min edit window. Scene messages are GM-authored, so the GM can
  // edit/delete them; the author can also edit/delete within 15 minutes. NPC
  // messages respect the same 15-minute window as regular messages.
  const withinEditWindow = new Date().getTime() - new Date(message.created_at).getTime() < 15 * 60 * 1000
  const canEdit = !message.is_deleted && (
    (isMe && withinEditWindow && (message.type === 'regular' || message.type === 'npc')) ||
    (isGM && message.type === 'scene')
  )

  const handleSaveEdit = async () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await onEdit(message.id, editContent)
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to edit message', err)
      setError('Failed to edit message.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this message?')) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onDelete(message.id)
      setIsSubmitting(false)
    } catch (err) {
      console.error('Failed to delete message', err)
      setError('Failed to delete message.')
      setIsSubmitting(false)
    }
  }

  const handleToggleReaction = (emoji: string) => {
    onToggleReaction?.(message.id, emoji)
  }

  // Recreate renderers only when the values the closures capture change, so
  // local re-renders (e.g. editing) don't hand ReactMarkdown a new `components`
  // reference and force a markdown re-parse.
  const renderers = useMemo(() => ({
    a: ({ _node, href, children, ...props }: any) => {
      if (href?.startsWith('dice:')) {
        const notation = href.slice(5)
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onRollDice?.(notation, message.id)
            }}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition-colors cursor-pointer border border-indigo-200 shadow-sm"
            title={`Roll ${notation}`}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} /><circle cx="8" cy="8" r="2" fill="currentColor" /><circle cx="16" cy="8" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="16" r="2" fill="currentColor" /><circle cx="16" cy="16" r="2" fill="currentColor" /></svg>
            {children}
          </button>
        )
      }
      if (href?.startsWith('check:')) {
        const ability = href.slice(6)
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              let finalModifier: number | null = null
              let isMissingMod = false
              
              const systemAttributes = getSystemAttributes(gameSystem)

              if (systemAttributes.includes(ability)) {
                const myMember = members?.find(m => m.user_id === currentUserId)
                const myAttributes = myMember?.attributes || {}
                
                if (typeof myAttributes[ability] === 'number') {
                  finalModifier = myAttributes[ability]
                } else {
                  isMissingMod = true
                  const modifierStr = window.prompt(`Enter modifier for ${ability} Check (Missing in profile!):`, '0')
                  if (modifierStr !== null) {
                    finalModifier = parseInt(modifierStr, 10) || 0
                  }
                }
              } else {
                const modifierStr = window.prompt(`Enter modifier for ${ability} Check:`, '0')
                if (modifierStr !== null) {
                  finalModifier = parseInt(modifierStr, 10) || 0
                }
              }

              if (finalModifier !== null) {
                finalModifier = clampModifier(gameSystem, finalModifier)
                const sign = finalModifier >= 0 ? '+' : ''
                const warning = isMissingMod ? `\n\n*⚠️ Missing ${ability} modifier in character profile. Result may require manual math if not entered correctly.*` : ''
                onRollDice?.(`1d20${finalModifier !== 0 ? `${sign}${finalModifier}` : ''}${warning}`, message.id)
              }
            }}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer border border-amber-200 shadow-sm"
            title={`Roll ${ability} Check`}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            {children}
          </button>
        )
      }
      if (href?.startsWith('user:')) {
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium text-xs border border-indigo-100">
            {children}
          </span>
        )
      }
      return <a href={href} {...props} target="_blank" rel="noopener noreferrer">{children}</a>
    },
    img: ({ src, alt, ...props }: any) => {
      return (
        <img 
          src={src} 
          alt={alt || "Image"} 
          className="max-w-full h-auto rounded-lg shadow-sm my-2 object-contain max-h-96" 
          loading="lazy" 
          referrerPolicy="no-referrer"
          {...props} 
        />
      )
    }
  }), [onRollDice, gameSystem, members, currentUserId, message.id])

  const replyBlock = message.reply?.id ? (
    <button
      type="button"
      onClick={() => onJumpToMessage?.(message.reply!.id)}
      disabled={!onJumpToMessage}
      className="mt-1 w-full text-left px-2 py-1.5 rounded-md bg-gray-50 border-l-2 border-indigo-300 hover:bg-indigo-50 transition-colors"
    >
      <span className="text-xs font-medium text-indigo-700">
        Replying to {replySenderName || 'someone'}
      </span>
      <span className="block text-xs text-gray-500 truncate">
        {message.reply!.is_deleted ? 'This message was deleted.' : snippet(message.reply!.content) || '(no text)'}
      </span>
    </button>
  ) : null

  const reactionsRow = reactions && reactions.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {reactions.map(r => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => handleToggleReaction(r.emoji)}
          className={`px-1.5 py-0.5 rounded-full text-xs border transition-colors ${r.hasReacted ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
          aria-label={`Reaction ${r.emoji}, ${r.count}`}
        >
          <span className="mr-0.5">{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  ) : null

  const reactionPicker = onToggleReaction ? (
    <EmojiPicker onPick={handleToggleReaction} />
  ) : null

  if (isSystem) {
    return (
      <div ref={itemRef} className={`flex justify-center my-4 transition-colors duration-1000 ${isHighlighted ? 'bg-yellow-100 rounded-lg p-2' : ''}`}>
        <div className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full">
          {message.content}
        </div>
      </div>
    )
  }

  if (isScene) {
    return (
      <div ref={itemRef} className={`my-6 px-4 py-6 bg-[#fdf6e3] border-y-2 border-[#e6d0a4] shadow-sm flex flex-col items-center transition-colors duration-1000 ${isHighlighted ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}`}>
        <div className="max-w-2xl w-full text-center font-serif text-[#5c4a3d] prose prose-sm sm:prose-base prose-p:text-[#5c4a3d] prose-headings:text-[#4a3b31] prose-strong:text-[#4a3b31] prose-em:text-[#5c4a3d] prose-a:text-[#4a3b31] prose-blockquote:text-[#5c4a3d] prose-blockquote:border-[#e6d0a4] prose-ul:text-[#5c4a3d] prose-ol:text-[#5c4a3d] max-w-none break-words [&>p:last-child]:bg-[#f4e4c1] [&>p:last-child]:p-4 [&>p:last-child]:mt-6 [&>p:last-child]:rounded-md [&>p:last-child]:shadow-inner [&>p:last-child]:font-bold [&>p:last-child]:italic [&>p:last-child]:text-[#4a3b31]">
          {isEditing ? (
            <div className="mt-2 text-left">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                rows={3}
              />
              <div className="mt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers} urlTransform={urlTransform}>{linkifyDice(message.content)}</ReactMarkdown>
          )}
          {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
        </div>
        {!message.is_deleted && !isEditing && (onReply || canEdit || isGM) && (
          <div className="flex-shrink-0 flex items-center gap-1 mt-3">
            {onReply && (
              <button type="button" onClick={() => onReply(message)} className="text-gray-400 hover:text-indigo-600 p-1" aria-label="Reply">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-indigo-600 p-1" aria-label="Edit">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
            )}
            {(canEdit || isGM) && (
              <button type="button" onClick={handleDelete} className="text-gray-400 hover:text-red-600 p-1 ml-1" aria-label="Delete">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
            {onXCard && (
              <button
                type="button"
                onClick={() => onXCard(message.id)}
                className="text-gray-400 hover:text-red-600 p-1 ml-1"
                aria-label="X-Card"
                title="X-Card: privately flag this scene to the GM"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8l8 8M16 8l-8 8" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (message.type === 'dice_roll') {
    return (
      <div ref={itemRef} className={`flex items-center space-x-3 my-4 px-4 bg-indigo-50 py-3 rounded-lg border border-indigo-100 shadow-sm mx-auto max-w-lg transition-all duration-1000 ${isHighlighted ? 'ring-4 ring-yellow-400 ring-offset-2 scale-[1.02]' : ''}`}>
        <div className="flex-shrink-0 bg-indigo-200 p-2 rounded-full text-indigo-700">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
            <circle cx="16" cy="8" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="8" cy="16" r="2" fill="currentColor" />
            <circle cx="16" cy="16" r="2" fill="currentColor" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {replyBlock}
          <span className="text-xs font-semibold text-indigo-800 tracking-wide uppercase">
            {senderName} rolled dice
          </span>
          <div className="text-gray-900 text-lg">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={itemRef} className={`group flex items-start space-x-3 my-4 px-4 py-2 transition-all duration-1000 ${isWhisper ? 'bg-purple-50 rounded-lg border border-purple-100' : ''} ${isNpc ? 'bg-[#fdf6e3] rounded-lg border border-[#e6d0a4]' : ''} ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 rounded-lg' : ''}`}>
      <div className="flex-shrink-0">
        {isNpc ? (
          message.npc_avatar_url ? (
            <img className="h-10 w-10 rounded-full" src={message.npc_avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-[#e6d0a4] flex items-center justify-center text-[#5c4a3d] font-serif">
              {message.npc_name?.[0]?.toUpperCase() || '?'}
            </div>
          )
        ) : message.sender?.avatar_url ? (
          <img className="h-10 w-10 rounded-full" src={message.sender.avatar_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
            {senderName?.[0]?.toUpperCase() || '?'}
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline space-x-2">
          <span className={`text-sm font-medium ${isNpc ? 'font-serif text-[#4a3b31]' : 'text-gray-900'}`}>
            {senderName}
          </span>
          <span className="text-xs text-gray-500">
            {formatTimestamp(message.created_at)}
          </span>
          {isWhisper && (
            <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
              Whisper to {message.whisper_to === currentUserId ? 'You' : message.whisper_target?.display_name}
            </span>
          )}
          {message.is_edited && !message.is_deleted && (
            <span className="text-xs text-gray-400 italic">(edited)</span>
          )}
        </div>

        {replyBlock}

        <div className={`mt-1 text-sm text-gray-800 prose prose-sm prose-indigo max-w-none break-words ${isNpc ? 'font-serif text-[#5c4a3d] prose-a:text-[#4a3b31] prose-strong:text-[#4a3b31]' : ''}`}>
          {message.is_deleted ? (
            <span className="text-gray-400 italic">This message was deleted.</span>
          ) : isEditing ? (
            <div className="mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                rows={3}
              />
              <div className="mt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers} urlTransform={urlTransform}>{linkifyDice(message.content)}</ReactMarkdown>
          )}
          {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
        </div>

        {!message.is_deleted && !isEditing && (
          <div className="mt-1 flex items-center gap-0.5">
            {reactionsRow}
            {reactionPicker}
          </div>
        )}
      </div>

      {!message.is_deleted && !isEditing && (onReply || canEdit || isGM) && (
        <div className="flex-shrink-0 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
          {onReply && (
            <button type="button" onClick={() => onReply(message)} className="text-gray-400 hover:text-indigo-600 p-1" aria-label="Reply">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-indigo-600 p-1" aria-label="Edit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
          )}
          {(canEdit || isGM) && (
            <button type="button" onClick={handleDelete} className="text-gray-400 hover:text-red-600 p-1 ml-1" aria-label="Delete">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
          {onXCard && (
            <button
              type="button"
              onClick={() => onXCard(message.id)}
              className="text-gray-400 hover:text-red-600 p-1 ml-1"
              aria-label="X-Card"
              title="X-Card: privately flag this scene to the GM"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8l8 8M16 8l-8 8" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
})
