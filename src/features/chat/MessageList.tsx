import { useEffect, useRef, Fragment } from 'react'
import { MessageItem } from './MessageItem'
import type { Database } from '../../types/database'
import type { ReactionSummary } from './useMessages'
import { useAuth } from '../auth/useAuth'

type Message = Database['public']['Tables']['messages']['Row'] & {
  sender?: { display_name: string | null; avatar_url: string | null } | null
  whisper_target?: { display_name: string | null; avatar_url: string | null } | null
}

interface MessageListProps {
  messages: Message[]
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string) => void
  highlightMessageId?: string | null
  members?: Array<{ user_id: string; character_name: string; attributes?: any }>
  gameSystem?: string
  reactionsByMessage?: Record<string, ReactionSummary[]>
  onToggleReaction?: (messageId: string, emoji: string) => void
  onReply?: (message: Message) => void
  onJumpToMessage?: (messageId: string) => void
}

export function MessageList({ messages, isGM, onEdit, onDelete, onRollDice, highlightMessageId, members = [], gameSystem = 'none', reactionsByMessage, onToggleReaction, onReply, onJumpToMessage }: MessageListProps) {
  const { user } = useAuth()
  const endOfListRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive, unless we are highlighting a message
  useEffect(() => {
    if (!highlightMessageId) {
      endOfListRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, highlightMessageId])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm">No messages yet. Say hello!</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((message, index) => {
        const currentDate = new Date(message.created_at).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        const prevMessage = index > 0 ? messages[index - 1] : null
        const prevDate = prevMessage ? new Date(prevMessage.created_at).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : null
        const showDivider = currentDate !== prevDate

        return (
          <Fragment key={message.id}>
            {showDivider && (
              <div data-testid="date-divider" className="flex items-center my-6">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {currentDate}
                </span>
                <div className="flex-grow border-t border-gray-300"></div>
              </div>
            )}
            <MessageItem
              message={message}
              currentUserId={user?.id}
              isGM={isGM}
              onEdit={onEdit}
              onDelete={onDelete}
              onRollDice={onRollDice}
              isHighlighted={highlightMessageId === message.id}
              members={members}
              gameSystem={gameSystem}
              reactions={reactionsByMessage?.[message.id]}
              onToggleReaction={onToggleReaction}
              onReply={onReply}
              onJumpToMessage={onJumpToMessage}
            />
          </Fragment>
        )
      })}
      <div ref={endOfListRef} />
    </div>
  )
}
