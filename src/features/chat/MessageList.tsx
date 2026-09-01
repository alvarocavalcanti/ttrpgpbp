import { useEffect, useRef, Fragment, useMemo, useCallback } from 'react'
import { MessageItem } from './MessageItem'
import type { ReactionSummary } from './useMessages'
import type { ChatMessage, Member } from './types'
import { useAuth } from '../auth/useAuth'

type Message = ChatMessage

// Within this many pixels of the bottom we consider the user "at the bottom",
// so late-loading content (lazy images) keeps the view pinned to the newest
// message instead of leaving a gap.
const SCROLL_BOTTOM_THRESHOLD = 24

interface MessageListProps {
  messages: Message[]
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string, replyToId?: string, warning?: string) => void
  highlightMessageId?: string | null
  members?: Member[]
  gameSystem?: string
  reactionsByMessage?: Record<string, ReactionSummary[]>
  onToggleReaction?: (messageId: string, emoji: string) => void
  onReply?: (message: Message) => void
  onJumpToMessage?: (messageId: string) => void
  lastReadAt?: string | null
  onXCard?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  onRemovePending?: (messageId: string) => void
  error?: Error | null
  hasMore?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
}

export function MessageList({ messages, isGM, onEdit, onDelete, onRollDice, highlightMessageId, members = [], gameSystem = 'none', reactionsByMessage, onToggleReaction, onReply, onJumpToMessage, lastReadAt, onXCard, onRetry, onRemovePending, error, hasMore, loadingOlder, onLoadOlder }: MessageListProps) {
  const { user } = useAuth()
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const newMessagesDividerRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  // Scroll position bookkeeping: prepending older messages must keep the
  // viewport anchored where the user is, not jump back to the bottom.
  const scrollInfoRef = useRef({ height: 0, top: 0 })
  const prevLenRef = useRef(0)
  const firstIdRef = useRef<string | undefined>(undefined)
  const lastIdRef = useRef<string | undefined>(undefined)

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

  // Scroll to the oldest unread message (the "New messages" divider) when one
  // exists, otherwise to the bottom. Used for the initial load and when the
  // app comes back to the foreground, so both behave the same.
  const scrollToUnread = useCallback(() => {
    if (newMessagesDividerRef.current) {
      newMessagesDividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      atBottomRef.current = false
      return
    }
    const list = listRef.current
    if (list) {
      list.scrollTop = list.scrollHeight
      atBottomRef.current = true
    }
  }, [])

  // Auto-scroll on initial load or when new messages arrive, unless we are
  // highlighting a message. Loading older history (prepending) preserves the
  // current scroll position instead of snapping back to the bottom.
  useEffect(() => {
    const list = listRef.current
    const firstId = messages[0]?.id
    const lastId = messages[messages.length - 1]?.id
    const grew = messages.length > prevLenRef.current
    const initialLoad = prevLenRef.current === 0 && messages.length > 0
    const prepended = grew && firstIdRef.current !== undefined && firstId !== firstIdRef.current
    const appended = grew && lastId !== undefined && lastId !== lastIdRef.current
    prevLenRef.current = messages.length
    firstIdRef.current = firstId
    lastIdRef.current = lastId

    if (highlightMessageId) return

    if (prepended && list) {
      const addedHeight = list.scrollHeight - scrollInfoRef.current.height
      list.scrollTop = scrollInfoRef.current.top + addedHeight
    } else if (initialLoad) {
      scrollToUnread()
    } else if (appended && atBottomRef.current && list) {
      list.scrollTop = list.scrollHeight
    }

    if (list) scrollInfoRef.current = { height: list.scrollHeight, top: list.scrollTop }
  }, [messages, highlightMessageId, scrollToUnread])

  // Track whether the user is at the bottom. Also keeps the prepend-anchoring
  // bookkeeping fresh on manual scrolling.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onScroll = () => {
      atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < SCROLL_BOTTOM_THRESHOLD
      scrollInfoRef.current = { height: list.scrollHeight, top: list.scrollTop }
    }
    list.addEventListener('scroll', onScroll)
    return () => list.removeEventListener('scroll', onScroll)
  }, [])

  // Late-loading content (lazy images with unknown heights) grows the list
  // without a message-array change; while pinned to the bottom, keep the
  // newest message visible instead of leaving a gap above the viewport edge.
  useEffect(() => {
    const list = listRef.current
    const content = contentRef.current
    if (!list || !content) return
    const observer = new ResizeObserver(() => {
      if (!atBottomRef.current) return
      // Setting scrollTop does not resize the content wrapper, so this cannot
      // loop back into the observer.
      list.scrollTop = list.scrollHeight - list.clientHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  // Restore the scroll position the browser dropped while the app was hidden,
  // instead of re-anchoring to the unread divider: a return from background
  // must never yank someone reading history (issue #338). Fresh mounts and
  // initial load still anchor via the layout effect above.
  const scrollTopOnHideRef = useRef<number | null>(null)
  useEffect(() => {
    const onVisibilityChange = () => {
      const list = listRef.current
      if (!list) return
      if (document.visibilityState !== 'visible') {
        scrollTopOnHideRef.current = list.scrollTop
        return
      }
      const captured = scrollTopOnHideRef.current
      scrollTopOnHideRef.current = null
      // Only writes when the browser actually dropped the position (mobile
      // Safari/virtualized tabs reset it); a preserved position is untouched.
      if (captured !== null && Math.abs(list.scrollTop - captured) > 1) {
        list.scrollTop = captured
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {error ? (
          <p className="text-red-500 dark:text-red-400 text-sm">Could not load messages.</p>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-sm">No messages yet. Say hello!</p>
        )}
      </div>
    )
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2">
      <div ref={contentRef}>
      {hasMore && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50"
          >
            {loadingOlder ? 'Loading older messages...' : 'Load older messages'}
          </button>
        </div>
      )}
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
                <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {currentDate}
                </span>
                <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
              </div>
            )}
            {showNewDivider && (
              <div ref={newMessagesDividerRef} data-testid="new-messages-divider" className="flex items-center my-6">
                <div className="flex-grow border-t-2 border-red-400 dark:border-red-500"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider">
                  New messages
                </span>
                <div className="flex-grow border-t-2 border-red-400 dark:border-red-500"></div>
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
                onRetry={onRetry}
                onRemovePending={onRemovePending}
              />
            </Fragment>
        )
      })}
      </div>
    </div>
  )
}
