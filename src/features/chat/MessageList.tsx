import { useEffect, useRef } from 'react'
import { MessageItem } from './MessageItem'
import type { Database } from '../../types/database'
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
}

export function MessageList({ messages, isGM, onEdit, onDelete, onRollDice, highlightMessageId }: MessageListProps) {
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
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          currentUserId={user?.id}
          isGM={isGM}
          onEdit={onEdit}
          onDelete={onDelete}
          onRollDice={onRollDice}
          isHighlighted={highlightMessageId === message.id}
        />
      ))}
      <div ref={endOfListRef} />
    </div>
  )
}
