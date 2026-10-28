import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { channelRoomPath } from '../../lib/publicRoutes'
import type { SubChannel } from './useSubChannels'

interface SubChannelTabsProps {
  channelId: string
  channelName: string | null
  subChannels: SubChannel[]
  counts: Record<string, number>
  activeSubId: string | null
  loading: boolean
  error: Error | null
  isGM: boolean
  onManage: () => void
  onRetry: () => void
}

const TAB_BASE =
  'flex-shrink-0 inline-flex items-center min-h-9 px-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors'
const TAB_ACTIVE = 'bg-primary-600 text-white'
const TAB_IDLE = 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
const ICON_BUTTON =
  'flex-shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 rounded-full text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'

// The room bar (#621). Renders nothing until a channel has at least one room,
// so legacy channels are pixel-identical. Main is the existing `/channel/:id`
// timeline; rooms are `/channel/:id/sub/:subId`.
export function SubChannelTabs({
  channelId,
  channelName,
  subChannels,
  counts,
  activeSubId,
  loading,
  error,
  isGM,
  onManage,
  onRetry,
}: SubChannelTabsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const activeKey = activeSubId ?? 'main'

  // Keep the active tab in view when rooms are switched by navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-room-key="${activeKey}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey, subChannels.length])

  // Loading: two skeleton pills, held to the bar's height so the messages area
  // does not shift when the strip resolves.
  if (loading) {
    return (
      <div
        className="w-full flex gap-2 px-3 py-2 border-b border-surface-200 dark:border-surface-700"
        aria-hidden="true"
      >
        <div className="h-7 w-16 rounded-full bg-surface-200 dark:bg-surface-700 animate-pulse" />
        <div className="h-7 w-16 rounded-full bg-surface-200 dark:bg-surface-700 animate-pulse" />
      </div>
    )
  }

  // Zero rooms = today's experience. A fetch failure degrades to Main with a
  // Retry rather than blanking the channel.
  if (error) {
    return (
      <div className="w-full flex items-center gap-3 px-4 py-2 border-b border-surface-200 dark:border-surface-700 text-sm">
        <span className="font-medium text-surface-700 dark:text-surface-300">{channelName ?? 'Main'}</span>
        <span className="text-surface-500 dark:text-surface-400">{"Couldn't load rooms"}</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center min-h-11 px-2 font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (subChannels.length === 0) return null

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'))
    const current = tabs.findIndex(t => t === document.activeElement)
    if (current === -1) return
    e.preventDefault()
    let next = current
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else next = tabs.length - 1
    tabs[next]?.focus()
  }

  const renderTab = (key: string, label: string, href: string, unread: number, locked = false) => {
    const isActive = key === activeKey
    return (
      <Link
        key={key}
        to={href}
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        data-room-key={key}
        className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
      >
        {locked && (
          <svg className="mr-1 h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true" data-testid="room-lock">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
        {label}
        {unread > 0 && (
          <span
            className="ml-1.5 inline-block h-2 w-2 rounded-full bg-primary-400"
            aria-label={`${unread} unread`}
          />
        )}
      </Link>
    )
  }

  return (
    <div className="w-full flex items-center border-b border-surface-200 dark:border-surface-700">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Rooms"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto px-3 py-2"
      >
        {renderTab('main', 'Main', `/channel/${channelId}`, counts.main ?? 0)}
        {subChannels.map(room => renderTab(room.id, room.name ?? 'Room', channelRoomPath(channelId, room.id), counts[room.id] ?? 0, (room.visibility ?? 'all') !== 'all'))}
      </div>
      {isGM && (
        <div className="flex-shrink-0 flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={onManage}
            aria-label="Add room"
            className={`${ICON_BUTTON} w-auto px-3 text-sm font-medium`}
          >
            + Room
          </button>
          <button type="button" onClick={onManage} aria-label="Manage rooms" className={ICON_BUTTON}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
