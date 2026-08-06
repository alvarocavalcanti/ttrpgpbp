import { useState, useRef, useEffect } from 'react'
import type { Database } from '../../types/database'
import { DiceRoller } from '../dice/DiceRoller'
import { linkifyMentions } from './mentions'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

export interface ReplyTarget {
  id: string
  content: string
  senderName: string | null
}

interface MessageComposerProps {
  isGM: boolean
  members: ChannelMember[]
  onSendMessage: (payload: { content: string, type: 'regular' | 'scene', whisper_to?: string, active_player_ids?: string[], reply_to?: string, mention_user_ids?: string[] }) => Promise<void>
  onRollDice?: (notation: string) => void
  replyTo?: ReplyTarget | null
  onCancelReply?: () => void
}

export function MessageComposer({ isGM, members, onSendMessage, onRollDice, replyTo, onCancelReply }: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [isScene, setIsScene] = useState(false)
  const [loadImages, setLoadImages] = useState(false)
  const [whisperTo, setWhisperTo] = useState<string>('')
  const [activePlayerIds, setActivePlayerIds] = useState<string[] | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [mentionState, setMentionState] = useState<{ start: number; query: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [content])

  const matchedMembers = mentionState
    ? members.filter(m => m.character_name && m.character_name.toLowerCase().startsWith(mentionState.query.toLowerCase()))
    : []

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursor = e.target.selectionStart ?? value.length
    setContent(value)
    // Detect an in-progress @mention: '@' preceded by start/whitespace, no spaces after.
    const uptoCursor = value.slice(0, cursor)
    const match = uptoCursor.match(/(^|\s)@([^\s]*)$/)
    if (match) {
      const atIndex = cursor - match[2].length - 1
      setMentionState({ start: atIndex, query: match[2] })
    } else {
      setMentionState(null)
    }
  }

  const selectMention = (member: ChannelMember) => {
    if (!mentionState || !textareaRef.current) return
    const value = content
    const cursor = textareaRef.current.selectionStart ?? value.length
    const start = mentionState.start
    const next = value.slice(0, start) + '@' + member.character_name + ' ' + value.slice(cursor)
    setContent(next)
    setMentionState(null)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const pos = start + member.character_name.length + 2
      ta.setSelectionRange(pos, pos)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      let finalContent = content
      if (isGM && loadImages) {
        // Basic match for raw image URLs to convert to markdown images
        finalContent = finalContent.replace(/(^|\s)(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?)/gi, '$1![]($2)')
      }

      const { content: mentionContent, mentioned_user_ids } = linkifyMentions(finalContent, members)

      const payload: any = {
        content: mentionContent,
        type: isScene ? 'scene' : 'regular',
        whisper_to: whisperTo || undefined,
        active_player_ids: isGM ? activePlayerIds : undefined,
      }
      if (replyTo) payload.reply_to = replyTo.id
      if (mentioned_user_ids.length > 0) payload.mention_user_ids = mentioned_user_ids

      await onSendMessage(payload)
      setContent('')
      setIsScene(false)
      setWhisperTo('')
      setActivePlayerIds(undefined)
      setMentionState(null)
      onCancelReply?.()
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Send on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e as any)
      return
    }
    // Enter/Tab while a mention is open picks the first match instead of submitting
    if ((e.key === 'Enter' || e.key === 'Tab') && matchedMembers.length > 0) {
      e.preventDefault()
      selectMention(matchedMembers[0])
    }
  }

  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  return (
    <div className="bg-white border-t border-gray-200 p-2 sm:p-4">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col space-y-2">
          {/* Reply target bar */}
          {replyTo && (
            <div className="flex items-center space-x-2 px-2 text-sm bg-indigo-50 border border-indigo-100 rounded-md py-1.5">
              <svg className="w-4 h-4 flex-shrink-0 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="text-xs text-gray-700 truncate">
                <span className="font-medium text-indigo-700">Replying to {replyTo.senderName || 'someone'}:</span>{' '}
                {replyTo.content.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')}
              </span>
              <button
                type="button"
                onClick={onCancelReply}
                className="ml-auto p-0.5 text-gray-400 hover:text-gray-600"
                aria-label="Cancel reply"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {/* Controls row */}
          {isExpanded && (
            <div className="flex flex-wrap items-center gap-4 text-sm mb-2 px-2 sm:px-0">
              {onRollDice && (
                <div className="shrink-0">
                  <DiceRoller onRoll={onRollDice} />
                </div>
              )}

              {isGM && (
                <div className="flex items-center space-x-4 shrink-0">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 hover:text-indigo-600 transition-colors" title="Scene Description">
                    <input
                      type="checkbox"
                      aria-label="Scene Description"
                      checked={isScene}
                      onChange={(e) => setIsScene(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                    </svg>
                    <span className="hidden sm:inline">Scene</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 hover:text-indigo-600 transition-colors" title="Load Image URLs">
                    <input
                      type="checkbox"
                      aria-label="Load Image URLs"
                      checked={loadImages}
                      onChange={(e) => setLoadImages(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden sm:inline">Load Images</span>
                  </label>
                </div>
              )}

              {isGM && (
                <div className="flex items-center space-x-2 shrink-0">
                  <label htmlFor="activePlayers" className="text-gray-700">Active Player:</label>
                  <select
                    id="activePlayers"
                    value={activePlayerIds === undefined ? '' : activePlayerIds.length === 0 ? 'clear' : activePlayerIds[0]}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') setActivePlayerIds(undefined)
                      else if (val === 'clear') setActivePlayerIds([])
                      else setActivePlayerIds([val])
                    }}
                    className="border-gray-300 rounded-md text-sm py-1 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">(No change)</option>
                    <option value="clear">Clear Active Player</option>
                    {members.map(m => (
                      <option key={m.id} value={m.user_id}>
                        {m.character_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!isScene && (
                <div className="flex items-center space-x-2 shrink-0">
                  <label htmlFor="whisperTo" className="text-gray-700">Whisper:</label>
                  <select
                    id="whisperTo"
                    value={whisperTo}
                    onChange={(e) => setWhisperTo(e.target.value)}
                    className="border-gray-300 rounded-md text-sm py-1 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Everyone (Public)</option>
                    {members.map(m => (
                      <option key={m.id} value={m.user_id}>
                        {m.character_name} ({m.profile?.display_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-2 p-2 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
              {error}
            </div>
          )}

          <div className="flex items-end space-x-2 relative">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mb-1 p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors focus:outline-none flex-shrink-0"
              aria-label="Toggle options"
            >
              <svg className={`w-6 h-6 transform transition-transform ${isExpanded ? 'rotate-45 text-indigo-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <div className="relative flex-1">
              {matchedMembers.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 right-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {matchedMembers.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectMention(m) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center space-x-2"
                    >
                      {m.character_avatar_url && (
                        <img className="h-5 w-5 rounded-full" src={m.character_avatar_url} alt="" referrerPolicy="no-referrer" />
                      )}
                      <span className="font-medium text-gray-900">{m.character_name}</span>
                      {m.profile?.display_name && <span className="text-xs text-gray-400">({m.profile.display_name})</span>}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={isScene ? "Describe the scene..." : whisperTo ? "Type a private whisper..." : "Type a message... (Markdown supported, @ to mention)"}
                className={`block w-full border-gray-300 rounded-2xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-none py-3 px-4 max-h-[150px] ${isScene ? 'bg-[#fdf6e3] font-serif' : whisperTo ? 'bg-purple-50' : ''}`}
                rows={1}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="mb-1 p-2 flex-shrink-0 inline-flex items-center justify-center border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              aria-label="Send"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          {!isTouchDevice && (
            <div className="text-xs text-gray-400 text-right pr-12">
              Tip: {isMac ? '⌘' : 'Ctrl'} + Enter to send
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
