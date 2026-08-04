import { useState } from 'react'
import type { Database } from '../../types/database'
import { DiceRoller } from '../dice/DiceRoller'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

interface MessageComposerProps {
  isGM: boolean
  members: ChannelMember[]
  onSendMessage: (payload: { content: string, type: 'regular' | 'scene', whisper_to?: string, active_player_ids?: string[] }) => Promise<void>
  onRollDice?: (notation: string) => void
}

export function MessageComposer({ isGM, members, onSendMessage, onRollDice }: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [isScene, setIsScene] = useState(false)
  const [loadImages, setLoadImages] = useState(false)
  const [whisperTo, setWhisperTo] = useState<string>('')
  const [activePlayerIds, setActivePlayerIds] = useState<string[] | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    
    setIsSubmitting(true)
    try {
      let finalContent = content
      if (isGM && loadImages) {
        // Basic match for raw image URLs to convert to markdown images
        finalContent = finalContent.replace(/(^|\s)(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?)/gi, '$1![]($2)')
      }

      await onSendMessage({
        content: finalContent,
        type: isScene ? 'scene' : 'regular',
        whisper_to: whisperTo || undefined,
        active_player_ids: isGM ? activePlayerIds : undefined
      })
      setContent('')
      setIsScene(false)
      setWhisperTo('')
      setActivePlayerIds(undefined)
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Send on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e as any)
    }
  }

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col space-y-2">
          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-4 text-sm mb-2">
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
                <label htmlFor="activePlayers" className="text-gray-700">Set Turn:</label>
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
                  <option value="clear">Clear Turn</option>
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

          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isScene ? "Describe the scene..." : whisperTo ? "Type a private whisper..." : "Type a message... (Markdown supported)"}
              className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-none p-3 ${isScene ? 'bg-[#fdf6e3] font-serif' : whisperTo ? 'bg-purple-50' : ''}`}
              rows={3}
            />
            <div className="absolute bottom-2 right-2">
              <button
                type="submit"
                disabled={isSubmitting || !content.trim()}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-400 text-right pr-2">
            Tip: ⌘ + Enter to send
          </div>
        </div>
      </form>
    </div>
  )
}
