import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Database } from '../../types/database'
import { linkifyDice } from '../dice/parser'

type Message = Database['public']['Tables']['messages']['Row'] & {
  sender?: { display_name: string | null; avatar_url: string | null } | null
  whisper_target?: { display_name: string | null; avatar_url: string | null } | null
}

interface MessageItemProps {
  message: Message
  currentUserId: string | undefined
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string) => void
  isHighlighted?: boolean
}

export function MessageItem({ message, currentUserId, isGM, onEdit, onDelete, onRollDice, isHighlighted }: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  const isMe = message.sender_id === currentUserId
  const isWhisper = !!message.whisper_to
  const isScene = message.type === 'scene'
  const isSystem = message.type === 'system'

  // Check 15 min edit window
  const canEdit = isMe && !message.is_deleted && message.type === 'regular' && 
    (new Date().getTime() - new Date(message.created_at).getTime() < 15 * 60 * 1000)

  const handleSaveEdit = async () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    setIsSubmitting(true)
    try {
      await onEdit(message.id, editContent)
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to edit message', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this message?')) return
    setIsSubmitting(true)
    try {
      await onDelete(message.id)
    } catch (err) {
      console.error('Failed to delete message', err)
      setIsSubmitting(false)
    }
  }

  const renderers = {
    a: ({ _node, href, children, ...props }: any) => {
      if (href?.startsWith('dice:')) {
        const notation = href.slice(5)
        return (
          <button
            onClick={(e) => {
              e.preventDefault()
              onRollDice?.(notation)
            }}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition-colors cursor-pointer border border-indigo-200 shadow-sm"
            title={`Roll ${notation}`}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            {children}
          </button>
        )
      }
      if (href?.startsWith('check:')) {
        const ability = href.slice(6)
        return (
          <button
            onClick={(e) => {
              e.preventDefault()
              const modifierStr = window.prompt(`Enter modifier for ${ability} Check:`, '0')
              if (modifierStr !== null) {
                const modifier = parseInt(modifierStr, 10) || 0
                const sign = modifier >= 0 ? '+' : ''
                onRollDice?.(`1d20${modifier !== 0 ? `${sign}${modifier}` : ''}`)
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
  }

  const urlTransform = (url: string) => {
    if (url.startsWith('dice:') || url.startsWith('check:')) return url
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
        <div className="max-w-2xl w-full text-center font-serif text-[#5c4a3d] prose prose-sm sm:prose-base prose-p:text-[#5c4a3d] prose-headings:text-[#4a3b31] prose-strong:text-[#4a3b31] prose-em:text-[#5c4a3d] prose-a:text-[#4a3b31] prose-blockquote:text-[#5c4a3d] prose-blockquote:border-[#e6d0a4] prose-ul:text-[#5c4a3d] prose-ol:text-[#5c4a3d] max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers} urlTransform={urlTransform}>{linkifyDice(message.content)}</ReactMarkdown>
        </div>
      </div>
    )
  }

  if (message.type === 'dice_roll') {
    return (
      <div ref={itemRef} className={`flex items-center space-x-3 my-4 px-4 bg-indigo-50 py-3 rounded-lg border border-indigo-100 shadow-sm mx-auto max-w-lg transition-all duration-1000 ${isHighlighted ? 'ring-4 ring-yellow-400 ring-offset-2 scale-[1.02]' : ''}`}>
        <div className="flex-shrink-0 bg-indigo-200 p-2 rounded-full text-indigo-700">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-xs font-semibold text-indigo-800 tracking-wide uppercase">
            {message.sender?.display_name || 'Unknown User'} rolled dice
          </span>
          <div className="text-gray-900 text-lg">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers} urlTransform={urlTransform}>{linkifyDice(message.content)}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={itemRef} className={`group flex items-start space-x-3 my-4 px-4 py-2 transition-all duration-1000 ${isWhisper ? 'bg-purple-50 rounded-lg border border-purple-100' : ''} ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 rounded-lg' : ''}`}>
      <div className="flex-shrink-0">
        {message.sender?.avatar_url ? (
          <img className="h-10 w-10 rounded-full" src={message.sender.avatar_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
            {message.sender?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline space-x-2">
          <span className="text-sm font-medium text-gray-900">
            {message.sender?.display_name || 'Unknown User'}
          </span>
          <span className="text-xs text-gray-500">
            {(() => {
              const d = new Date(message.created_at);
              const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
              return diffHours > 20
                ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            })()}
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

        <div className="mt-1 text-sm text-gray-800 prose prose-sm prose-indigo max-w-none">
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
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
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
        </div>
      </div>

      {!message.is_deleted && !isEditing && (canEdit || isGM) && (
        <div className="flex-shrink-0 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <button onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-indigo-600 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
          )}
          {(canEdit || isGM) && (
            <button onClick={handleDelete} className="text-gray-400 hover:text-red-600 p-1 ml-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
