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

// Within this many pixels of the top we auto-load older messages (#346). Only
// when the list actually overflows — a short first page keeps the manual
// button, otherwise the initial scrollTop=0 render would chain-load history.
const AUTO_LOAD_TOP_THRESHOLD = 80

// Keys that scroll a focused list. Pressing one releases the divider anchor so
// the keyboard user's own scroll is never overridden by the re-center.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

// Vertical touch movement (px) before a gesture counts as scrolling rather than
// a tap, so a tap on a message does not release the scroll anchors.
const TOUCH_SCROLL_THRESHOLD = 8

interface MessageListProps {
  messages: Message[]
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string, replyToId?: string, warning?: string, dc?: number | null) => void
  highlightMessageId?: string | null
  members?: Member[]
  gameSystem?: string
  reactionsByMessage?: Record<string, ReactionSummary[]>
  onToggleReaction?: (messageId: string, emoji: string) => void
  onReply?: (message: Message) => void
  onJumpToMessage?: (messageId: string) => void
  lastReadAt?: string | null
  boundaryRevision?: number
  onRetry?: (messageId: string) => void
  onRemovePending?: (messageId: string) => void
  onRetryLoad?: () => void
  onEditCharacter?: () => void
  onReport?: (message: Message, reason: string) => Promise<void>
  error?: Error | null
  hasMore?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
}

export function MessageList({ messages, isGM, onEdit, onDelete, onRollDice, highlightMessageId, members = [], gameSystem = 'none', reactionsByMessage, onToggleReaction, onReply, onJumpToMessage, lastReadAt, boundaryRevision, onRetry, onRemovePending, onRetryLoad, onEditCharacter, onReport, error, hasMore, loadingOlder, onLoadOlder }: MessageListProps) {
  const { user } = useAuth()
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const newMessagesDividerRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  // True while the view is anchored to the "New messages" divider. Late-loading
  // images grow content under the smooth scroll's stale target and drift the
  // divider off-screen; while anchored, the ResizeObserver re-centers it with a
  // fresh position (cold start / lots of history, #284). A genuine user scroll
  // releases it so a reader is never yanked back (#338).
  const dividerAnchorRef = useRef(false)
  // Set once the user takes over (scroll gesture, or a jump to a highlighted
  // message); the view is then never auto-anchored again (#338).
  const userTookOverRef = useRef(false)
  // True from a scroll-gesture start until the gesture is recognized by a
  // scroll event (or ends). A ResizeObserver callback firing inside that window
  // must not snap the view back to the bottom/divider before the gesture lands.
  const gestureActiveRef = useRef(false)
  // Previous read boundary: detects the divider appearing AFTER the messages
  // already rendered (the channel and message loads are independent), so the
  // initial unread landing still runs (#284).
  const prevLastReadTimestampRef = useRef<number | null | undefined>(undefined)

  // Latest load-older props for the scroll handler (registered once below).
  const loadOlderStateRef = useRef({ hasMore: false, loadingOlder: false, onLoadOlder })
  loadOlderStateRef.current = { hasMore: !!hasMore, loadingOlder: !!loadingOlder, onLoadOlder }

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
      dividerAnchorRef.current = true
      newMessagesDividerRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      atBottomRef.current = false
      return
    }
    dividerAnchorRef.current = false
    const list = listRef.current
    if (list) {
      list.scrollTop = list.scrollHeight
      atBottomRef.current = true
    }
  }, [])

  // Returning to the foreground bumps the boundary revision (#502). When the
  // user was at the bottom, anchor to the "New messages" divider so messages
  // that arrived while away are actually shown; history readers keep their
  // position (#338). The revision (not the timestamp) drives this, so a return
  // where the read boundary value did not change still re-anchors.
  const prevBoundaryRevisionRef = useRef(boundaryRevision ?? 0)
  const pendingBoundaryAnchorRef = useRef(false)
  useEffect(() => {
    if (boundaryRevision === undefined || boundaryRevision <= prevBoundaryRevisionRef.current) {
      if (boundaryRevision !== undefined) prevBoundaryRevisionRef.current = boundaryRevision
      return
    }
    prevBoundaryRevisionRef.current = boundaryRevision
    if (!atBottomRef.current) return
    pendingBoundaryAnchorRef.current = true
    if (newMessagesDividerRef.current) {
      pendingBoundaryAnchorRef.current = false
      scrollToUnread()
    }
  }, [boundaryRevision, scrollToUnread])

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

    if (pendingBoundaryAnchorRef.current && newMessagesDividerRef.current) {
      pendingBoundaryAnchorRef.current = false
      scrollToUnread()
      if (list) scrollInfoRef.current = { height: list.scrollHeight, top: list.scrollTop }
      return
    }

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

  // A jump to a highlighted message owns the scroll position (search results,
  // quoted replies): drop the anchors so a later resize cannot yank the view
  // back to the unread divider (#455).
  useEffect(() => {
    if (!highlightMessageId) return
    dividerAnchorRef.current = false
    pendingBoundaryAnchorRef.current = false
    userTookOverRef.current = true
  }, [highlightMessageId])

  // The divider can disappear for reasons other than scrollToUnread (the read
  // boundary advances, a message edit changes it). A stale divider anchor would
  // then re-center a *new* divider for a reader who never re-anchored (#338).
  useEffect(() => {
    if (!newMessagesDividerRef.current) dividerAnchorRef.current = false
  }, [messages, lastReadTimestamp])

  // The channel and the messages load independently: the messages can render
  // first (no divider yet, so the initial load scrolls to the bottom), then the
  // read boundary arrives and inserts the divider. Run the initial unread
  // landing then, unless the user has already taken over (#284).
  useEffect(() => {
    const prev = prevLastReadTimestampRef.current
    prevLastReadTimestampRef.current = lastReadTimestamp
    if (prev === undefined) return
    if (prev === null && lastReadTimestamp !== null && !userTookOverRef.current && newMessagesDividerRef.current) {
      scrollToUnread()
    }
  }, [lastReadTimestamp, scrollToUnread])

  // Track whether the user is at the bottom. Also keeps the prepend-anchoring
  // bookkeeping fresh on manual scrolling.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onScroll = () => {
      // The gesture has been recognized by an actual scroll: the live position
      // is authoritative again.
      gestureActiveRef.current = false
      atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < SCROLL_BOTTOM_THRESHOLD
      scrollInfoRef.current = { height: list.scrollHeight, top: list.scrollTop }
      // Scroll-to-top auto-load: fetch older messages when the user scrolls
      // (nearly) to the top of an overflowing list, no click needed.
      const { hasMore, loadingOlder, onLoadOlder } = loadOlderStateRef.current
      if (
        hasMore &&
        !loadingOlder &&
        list.scrollHeight > list.clientHeight &&
        list.scrollTop < AUTO_LOAD_TOP_THRESHOLD
      ) {
        onLoadOlder?.()
      }
    }
    list.addEventListener('scroll', onScroll)
    // A real user scroll takeover releases both anchors so late content cannot
    // yank a reader back (#338). Only input that actually scrolls the list
    // counts: a click/tap on a link, button, or image control, or a key press
    // from a focused descendant, must not cancel the unread landing or the
    // resize correction. `gestureActiveRef` also blocks the ResizeObserver
    // re-pin until the gesture is recognized by a scroll event.
    const releaseAnchors = () => {
      dividerAnchorRef.current = false
      pendingBoundaryAnchorRef.current = false
      userTookOverRef.current = true
    }
    const onGestureStart = () => {
      gestureActiveRef.current = true
      releaseAnchors()
    }
    const onGestureEnd = () => { gestureActiveRef.current = false }
    const onKeyDown = (event: KeyboardEvent) => {
      // Keys bubble from focused descendants (links, inline editors) that do not
      // scroll the list.
      if (event.target === list && SCROLL_KEYS.has(event.key)) onGestureStart()
    }
    const onPointerDown = (event: PointerEvent) => {
      // Only grabbing the native scrollbar (the gutter right of the client box)
      // is a scroll takeover; a pointerdown on the content is not.
      if (event.clientX >= list.getBoundingClientRect().left + list.clientWidth) onGestureStart()
    }
    // Wheel has no end event: drop the guard on the next frame so image growth
    // can resume re-pinning once the wheel has been applied.
    const onWheel = () => {
      onGestureStart()
      requestAnimationFrame(onGestureEnd)
    }
    let touchStartY = 0
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      // A touch is scrolling only once it has moved vertically; a tap must not
      // cancel the anchors.
      const y = event.touches[0]?.clientY ?? touchStartY
      if (Math.abs(y - touchStartY) > TOUCH_SCROLL_THRESHOLD) onGestureStart()
    }
    list.addEventListener('wheel', onWheel, { passive: true })
    list.addEventListener('touchstart', onTouchStart, { passive: true })
    list.addEventListener('touchmove', onTouchMove, { passive: true })
    list.addEventListener('pointerdown', onPointerDown)
    list.addEventListener('keydown', onKeyDown)
    list.addEventListener('touchend', onGestureEnd)
    list.addEventListener('touchcancel', onGestureEnd)
    list.addEventListener('pointerup', onGestureEnd)
    list.addEventListener('pointercancel', onGestureEnd)
    return () => {
      list.removeEventListener('scroll', onScroll)
      list.removeEventListener('wheel', onWheel)
      list.removeEventListener('touchstart', onTouchStart)
      list.removeEventListener('touchmove', onTouchMove)
      list.removeEventListener('pointerdown', onPointerDown)
      list.removeEventListener('keydown', onKeyDown)
      list.removeEventListener('touchend', onGestureEnd)
      list.removeEventListener('touchcancel', onGestureEnd)
      list.removeEventListener('pointerup', onGestureEnd)
      list.removeEventListener('pointercancel', onGestureEnd)
    }
  }, [])

  // Late-loading content (lazy images with unknown heights) grows the list
  // without a message-array change; while pinned to the bottom, keep the
  // newest message visible instead of leaving a gap above the viewport edge.
  useEffect(() => {
    const list = listRef.current
    const content = contentRef.current
    if (!list || !content) return
    const observer = new ResizeObserver(() => {
      // A scroll gesture just started: let it take over before re-anchoring, so
      // a resize cannot snap the view back before the gesture lands.
      if (gestureActiveRef.current) return
      if (atBottomRef.current) {
        // Setting scrollTop does not resize the content wrapper, so this cannot
        // loop back into the observer.
        list.scrollTop = list.scrollHeight - list.clientHeight
        return
      }
      // Anchored to the "New messages" divider: late images grow the content
      // under the smooth scroll's stale target, so re-center instantly with a
      // fresh position (#284). 'auto' keeps it a silent correction, not a
      // second animation.
      if (dividerAnchorRef.current && newMessagesDividerRef.current) {
        newMessagesDividerRef.current.scrollIntoView({ behavior: 'auto', block: 'center' })
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  // Restore the scroll position the browser dropped while the app was hidden,
  // instead of re-anchoring to the unread divider: a return from background
  // must never yank someone reading history (issue #338). Fresh mounts and
  // initial load still anchor via the layout effect above.
  const restoreRef = useRef<{ top: number; lastId: string | undefined; atBottom: boolean } | null>(null)
  useEffect(() => {
    const onVisibilityChange = () => {
      const list = listRef.current
      if (!list) return
      if (document.visibilityState !== 'visible') {
        restoreRef.current = { top: list.scrollTop, lastId: lastIdRef.current, atBottom: atBottomRef.current }
        return
      }
      const captured = restoreRef.current
      restoreRef.current = null
      if (captured === null) return
      if (captured.atBottom) {
        // Was pinned to the bottom: stay there even if messages arrived while
        // hidden (appends shift offsets, so a numeric restore would be off).
        list.scrollTop = list.scrollHeight
        return
      }
      // Only writes when the browser actually dropped the position (mobile
      // Safari/virtualized tabs reset it) AND no messages arrived while hidden
      // — new content would have shifted the offsets the capture refers to.
      if (
        captured.lastId === lastIdRef.current &&
        Math.abs(list.scrollTop - captured.top) > 1
      ) {
        list.scrollTop = captured.top
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        {error ? (
          <>
            <p className="text-red-500 dark:text-red-400 text-sm">Could not load messages.</p>
            {onRetryLoad && (
              <button
                type="button"
                onClick={onRetryLoad}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200"
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <p className="text-surface-400 dark:text-surface-400 text-sm">No messages yet. Say hello!</p>
        )}
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      role="log"
      aria-live="polite"
      tabIndex={0}
      className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 space-y-2"
    >
      <div ref={contentRef}>
      {hasMore && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="inline-flex items-center justify-center min-h-11 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 disabled:opacity-50"
          >
            {/* Manual fallback for short first pages (no scroll => no auto-load) */}
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
              <div data-testid="date-divider" className="flex items-center my-3 -mx-2">
                <div className="flex-grow border-t border-surface-300 dark:border-surface-600"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                  {currentDate}
                </span>
                <div className="flex-grow border-t border-surface-300 dark:border-surface-600"></div>
              </div>
            )}
            {showNewDivider && (
              <div ref={newMessagesDividerRef} data-testid="new-messages-divider" className="flex items-center my-3 -mx-2">
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
              onRetry={onRetry}
              onEditCharacter={onEditCharacter}
              onRemovePending={onRemovePending}
              onReport={onReport}
              />
            </Fragment>
        )
      })}
      </div>
    </div>
  )
}
