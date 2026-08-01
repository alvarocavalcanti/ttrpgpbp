import { useState } from 'react'
import type { Database } from '../../types/database'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

interface MessageComposerProps {
  isGM: boolean
  members: ChannelMember[]
  onSendMessage: (payload: { content: string, type: 'regular' | 'scene', whisper_to?: string, active_player_ids?: string[] }) => Promise<void>
}

export function MessageComposer({ isGM, members, onSendMessage }: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [isScene, setIsScene] = useState(false)
  const [whisperTo, setWhisperTo] = useState<string>('')
  const [activePlayerIds, setActivePlayerIds] = useState<string[] | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    
    setIsSubmitting(true)
    try {
      await onSendMessage({
        content,
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
            {isGM && (
              <label className="flex items-center space-x-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isScene}
                  onChange={(e) => setIsScene(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                />
                <span className="text-gray-700">Scene Description</span>
              </label>
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
