import { useState, useRef, useLayoutEffect } from 'react'
import { Markdown } from '../../components/Markdown'
import { supabase } from '../../lib/supabase'
import { MAX_STATUS_LENGTH } from '../../constants'

interface ActivePlayer {
  character_name: string
  user_id: string
  is_away?: boolean
}

interface ChannelStatusBarProps {
  channelId: string
  statusText: string | null
  activePlayers: ActivePlayer[]
  isGM: boolean
  onUpdate: () => void
}

export function ChannelStatusBar({ channelId, statusText, activePlayers, isGM, onUpdate }: ChannelStatusBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(statusText || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Chevron only when the clamped (collapsed) status text actually overflows
  // one line; single-line text has nothing to expand.
  const statusRef = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = statusRef.current
    if (!el) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [statusText, isExpanded])

  const handleSave = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('channels')
        .update({ status_text: editContent || null })
        .eq('id', channelId)

      if (updateError) throw updateError
      
      setIsEditing(false)
      onUpdate()
    } catch (err) {
      console.error('Error saving status:', err)
      setError('Failed to save status.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasContent = statusText || activePlayers.length > 0

  if (!hasContent && !isGM && !isEditing) return null

  return (
    <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800">
      {activePlayers.length > 0 && !isEditing && (
        <div className="px-4 py-1.5 sm:px-6 border-b border-amber-200 dark:border-amber-800 flex items-center space-x-2 flex-wrap">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Active:</span>
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {activePlayers.map((p, i) => (
              <span key={p.user_id}>
                {i > 0 && ', '}
                <span className={p.is_away ? 'line-through opacity-50' : ''}>
                  {p.character_name}
                </span>
                {p.is_away && <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase ml-1">(AFK)</span>}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="px-4 py-2 sm:px-6 flex justify-between items-start">
        <div className="flex-1 min-w-0 mr-4">
          {isEditing ? (
            <div className="space-y-2 mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={MAX_STATUS_LENGTH}
                placeholder="Write status, initiative order, or timers here... (Markdown supported)"
                className="w-full text-gray-900 dark:text-gray-100 border-amber-300 dark:border-amber-700 rounded-md shadow-sm focus:ring-amber-500 dark:focus:ring-amber-400 focus:border-amber-500 dark:focus:border-amber-400 sm:text-sm bg-white dark:bg-gray-800 p-2"
                rows={4}
              />
              {error && <div className="text-red-600 dark:text-red-400 text-xs mt-1">{error}</div>}
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  Save Status
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setEditContent(statusText || '')
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium rounded hover:bg-amber-300 dark:hover:bg-amber-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div
                ref={statusRef}
                className={`prose prose-sm max-w-none dark:prose-invert text-amber-900 dark:text-amber-200 prose-p:text-amber-900 dark:prose-p:text-amber-200 prose-strong:text-amber-900 dark:prose-strong:text-amber-200 prose-headings:text-amber-900 dark:prose-headings:text-amber-200 prose-em:text-amber-900 dark:prose-em:text-amber-200 prose-a:text-amber-700 dark:prose-a:text-amber-300 prose-blockquote:text-amber-900 dark:prose-blockquote:text-amber-200 prose-blockquote:border-amber-300 dark:prose-blockquote:border-amber-700 prose-ul:text-amber-900 dark:prose-ul:text-amber-200 prose-ol:text-amber-900 dark:prose-ol:text-amber-200 ${isExpanded ? '' : 'line-clamp-1'}`}>
                {statusText ? (
                  <Markdown>{statusText}</Markdown>
                ) : (
                  <span className="italic opacity-50">No status set.</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0 mt-1">
          {isGM && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-medium px-2 py-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
            >
              Edit
            </button>
          )}
          
          {!isEditing && statusText && (overflows || isExpanded) && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
              title={isExpanded ? "Collapse Status" : "Expand Status"}
            >
              <svg 
                className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
