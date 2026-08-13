import { useEffect, useRef, Fragment, useMemo } from 'react'
import { MessageItem } from './MessageItem'
import type { ReactionSummary } from './useMessages'
import type { ChatMessage } from './types'
import { useAuth } from '../auth/useAuth'

type Message = ChatMessage

interface MessageListProps {
  messages: Message[]
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string, replyToId?: string, warning?: string) => void
  highlightMessageId?: string | null
  members?: Array<{ user_id: string; character_name: string; attributes?: any }>
  gameSystem?: string
  reactionsByMessage?: Record<string, ReactionSummary[]>
  onToggleReaction?: (messageId: string, emoji: string) => void
  onReply?: (message: Message) => void
  onJumpToMessage?: (messageId: string) => void
  lastReadAt?: string | null
  onXCard?: (messageId: string) => void
  error?: Error | null
}

export function MessageList({ messages, isGM, onEdit, onDelete, onRollDice, highlightMessageId, members = [], gameSystem = 'none', reactionsByMessage, onToggleReaction, onReply, onJumpToMessage, lastReadAt, onXCard, error }: MessageListProps) {
  const { user } = useAuth()
  const endOfListRef = useRef<HTMLDivElement>(null)

  // Date labels are expensive (ICU locale lookup); compute once per message id
  // and look up in the render loop instead of re-formatting every pass.
  const dateLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of messages) {
      map.set(m.id, new Date(m.created_at).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    }
    return map
  }, [messages])

  const lastReadTimestamp = useMemo(
    () => (lastReadAt ? new Date(lastReadAt).getTime() : null),
    [lastReadAt]
  )

  // Auto-scroll to bottom when new messages arrive, unless we are highlighting a message
  useEffect(() => {
    if (!highlightMessageId) {
      endOfListRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, highlightMessageId])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {error ? (
          <p className="text-red-500 text-sm">Could not load messages.</p>
        ) : (
          <p className="text-gray-400 text-sm">No messages yet. Say hello!</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2">
      {messages.map((message, index) => {
        const currentDate = dateLabels.get(message.id)!
        const prevMessage = index > 0 ? messages[index - 1] : null
        const prevDate = prevMessage ? dateLabels.get(prevMessage.id)! : null
        const showDivider = currentDate !== prevDate

        const isNew = lastReadTimestamp !== null && new Date(message.created_at).getTime() > lastReadTimestamp
        const prevIsNew = prevMessage && lastReadTimestamp !== null ? new Date(prevMessage.created_at).getTime() > lastReadTimestamp : false
        const showNewDivider = isNew && !prevIsNew && message.sender_id !== user?.id

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
            {showNewDivider && (
              <div data-testid="new-messages-divider" className="flex items-center my-6">
                <div className="flex-grow border-t-2 border-red-400"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-semibold text-red-500 uppercase tracking-wider">
                  New messages
                </span>
                <div className="flex-grow border-t-2 border-red-400"></div>
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
              onXCard={onXCard}
            />
          </Fragment>
        )
      })}
      <div ref={endOfListRef} />
    </div>
  )
}
