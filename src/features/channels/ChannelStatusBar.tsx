import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../../lib/supabase'

interface ActivePlayer {
  character_name: string
  user_id: string
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

  const handleSave = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('channels')
        .update({ status_text: editContent || null })
        .eq('id', channelId)

      if (error) throw error
      
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
    <div className="bg-amber-50 border-b border-amber-200">
      {activePlayers.length > 0 && !isEditing && (
        <div className="px-4 py-1.5 sm:px-6 border-b border-amber-200 flex items-center space-x-2">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Active:</span>
          <span className="text-sm font-medium text-amber-900">
            {activePlayers.map(p => p.character_name).join(', ')}
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
                placeholder="Write status, initiative order, or timers here... (Markdown supported)"
                className="w-full border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 sm:text-sm bg-white p-2"
                rows={4}
              />
              {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  Save Status
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditContent(statusText || '')
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-amber-200 text-amber-800 text-xs font-medium rounded hover:bg-amber-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className={`prose prose-sm prose-amber max-w-none text-amber-900 ${isExpanded ? '' : 'line-clamp-1'}`}>
                {statusText ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{statusText}</ReactMarkdown>
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
              onClick={() => setIsEditing(true)}
              className="text-amber-600 hover:text-amber-800 text-xs font-medium px-2 py-1 rounded hover:bg-amber-100 transition-colors"
            >
              Edit
            </button>
          )}
          
          {!isEditing && statusText && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-100 transition-colors"
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
