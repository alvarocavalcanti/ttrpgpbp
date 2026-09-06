import { useParams, Navigate, Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useChannel } from './useChannel'
import { ChannelSettings } from './ChannelSettings'
import { ChannelStatusBar } from './ChannelStatusBar'
import { MemberList } from './MemberList'
import { useMessages } from '../chat/useMessages'
import { MessageList } from '../chat/MessageList'
import { MessageComposer, type ReplyTarget } from '../chat/MessageComposer'
import type { ChatMessage, Member } from '../chat/types'
import { useAuth } from '../auth/useAuth'
import { SignedImg } from '../../components/SignedImg'
import { usePushNotifications } from '../notifications/usePushNotifications'
import { notifyChannelRead } from '../../lib/channelRead'

import { RollHistoryModal } from '../dice/RollHistoryModal'
import { SearchModal } from '../search/SearchModal'
import { ChannelNotificationSettingsModal } from '../notifications/ChannelNotificationSettingsModal'
import { useChannelNpcs } from './useChannelNpcs'
import { NpcManagementModal } from './NpcManagementModal'
import { ActivePlayerModal } from './ActivePlayerModal'
import { SafetyToolsModal } from './SafetyToolsModal'
import { useSafetyCardEvents } from './useSafetyCardEvents'
import { ChannelHelpModal } from '../help/ChannelHelpModal'
import { useToast } from '../../contexts/ToastContext'
import { useEdgeSwipe } from '../../hooks/useEdgeSwipe'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// Shared styling for the sidebar menu rows (Map, Rolls, Search, Notifications,
// Resources, Safety Tools, Help, GM Resources, NPCs, Active Player, Settings).
const SIDEBAR_MENU_ITEM =
  'block w-full text-left px-4 py-2.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors'

export function ChannelView() {
  const { id } = useParams<{ id: string }>()
  const { addToast } = useToast()
  const { user } = useAuth()
  const { preferences } = usePushNotifications()

  // Fire once per channel visit: once the read (last_read_at) has committed,
  // dismiss the channel's system notifications and refresh the launcher badge.
  const readHandledRef = useRef<string | null>(null)
  const handleChannelRead = useCallback(() => {
    if (!id || !user?.id || readHandledRef.current === id) return
    readHandledRef.current = id
    void notifyChannelRead(id, user.id, preferences?.badge_enabled !== false)
  }, [id, user?.id, preferences?.badge_enabled])

  // History-first read-mark (#412). The ref is the call-time gate handed to
  // useChannel (stable identity, so the realtime INSERT closure always reads
  // fresh state); the state exists so history loading can re-trigger the
  // deferred read-mark below. A failed messages fetch keeps the gate closed:
  // the channel must not be marked read for posts the player never saw.
  const messagesLoadedRef = useRef(false)
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const handleMessagesLoaded = useCallback(() => {
    if (messagesLoadedRef.current) return
    messagesLoadedRef.current = true
    setMessagesLoaded(true)
  }, [])
  const canMarkRead = useCallback(() => messagesLoadedRef.current, [])
  // Switching channels re-gates: the new channel's history must load before
  // its read mark advances.
  useEffect(() => {
    messagesLoadedRef.current = false
    setMessagesLoaded(false)
  }, [id])

  const { channel, members, loading: channelLoading, error, isGM, myMemberInfo, lastReadAt, markRead, refetch, gmOnlyResourcesUrl } = useChannel(id, handleChannelRead, canMarkRead)
  const { messages, reactions, loading: messagesLoading, error: messagesError, hasMore, loadingOlder, loadOlder, sendMessage, editMessage, deleteMessage, sendDiceRoll, addReaction, removeReaction, retryMessage, removePendingMessage, refresh: refreshMessages, retrying: messagesRetrying } = useMessages(id, handleMessagesLoaded)
  const { npcs, refetch: refetchNpcs } = useChannelNpcs(id)
  const { alertActive, alertCount, dismissAlert, triggerXCard } = useSafetyCardEvents(id, isGM)
  
  const [showSettings, setShowSettings] = useState(false)
  const [showRollHistory, setShowRollHistory] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [showSafetyTools, setShowSafetyTools] = useState(false)
  const [showNpcs, setShowNpcs] = useState(false)
  const [showActivePlayer, setShowActivePlayer] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  // Right-edge swipe opens/closes the sidebar on touch devices, matching the
  // lobby menu drawer. Desktop keeps the persistent lg: layout.
  useEdgeSwipe({ open: showMobileSidebar, onOpen: () => setShowMobileSidebar(true), onClose: () => setShowMobileSidebar(false) })
  // No header X in the drawer (issue #382): close via backdrop tap, edge
  // swipe, the header toggle, or Escape.
  useEscapeToClose(() => setShowMobileSidebar(false))
  // Focus containment while the drawer is open (UX-4): the sidebar element is
  // always mounted (translate-x-full when closed), so the trap is gated on
  // the open state instead of conditional rendering.
  const sidebarRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sidebarRef, showMobileSidebar)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  // Which member's character sheet is being edited; shared by MemberList and
  // the chat's check sheet ("Set it in your character sheet" deep link).
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)

  // Clear highlight after a few seconds
  useEffect(() => {
    if (highlightMessageId) {
      const timer = setTimeout(() => {
        setHighlightMessageId(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightMessageId])

  // Overlay modals open on top of the sidebar; close the mobile sidebar so it
  // doesn't stay open behind them.
  useEffect(() => {
    if (showSettings || showRollHistory || showSearch || showNotificationSettings || showSafetyTools || showNpcs || showHelp || showActivePlayer) {
      setShowMobileSidebar(false)
    }
  }, [showSettings, showRollHistory, showSearch, showNotificationSettings, showSafetyTools, showNpcs, showHelp, showActivePlayer])

  // Deferred read-mark (#412): the mount-time markRead in useChannel is gated
  // off until history loads; this fires it once the gate opens (tab visible).
  // Later member refetches re-run it harmlessly — writes are serialized and
  // the persisted value is monotonic.
  useEffect(() => {
    if (!messagesLoaded || !myMemberInfo?.id) return
    if (document.visibilityState !== 'visible') return
    markRead()
  }, [messagesLoaded, myMemberInfo?.id, markRead])

  const handleJumpToMessage = useCallback((messageId: string) => {
    setHighlightMessageId(messageId)
  }, [])

  const handleReply = useCallback((message: ChatMessage) => {
    const senderName = members.find(m => m.user_id === message.sender_id)?.character_name || message.sender?.display_name || null
    setReplyTo({ id: message.id, content: message.content, senderName })
  }, [members])

  // Read the latest reactions through a ref so the callback stays stable
  // (required for React.memo on MessageItem) without going stale.
  const reactionsRef = useRef(reactions)
  reactionsRef.current = reactions

  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      const summary = reactionsRef.current[messageId]?.find(r => r.emoji === emoji)
      if (summary?.hasReacted) {
        await removeReaction(messageId, emoji)
      } else {
        await addReaction(messageId, emoji)
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
      addToast('Failed to update reaction.', 'error')
    }
  }, [addReaction, removeReaction, addToast])

  // Dice-roll mentions only need user_id/character_name plus per-ability
  // modifiers; channel_members.attributes is a JSON object, so adapt the
  // narrow Member shape for MessageList. Declared above the early returns so
  // the hook count stays identical between the loading and loaded renders
  // (Rules of Hooks — a mismatch here crashes ChannelView on every cold load).
  const chatMembers = useMemo<Member[]>(() => members.map(m => ({
    user_id: m.user_id,
    character_name: m.character_name,
    attributes: (m.attributes as Record<string, number> | null) ?? undefined
  })), [members])

  // Stable callback identity so MessageItem's React.memo isn't defeated on
  // every ChannelView render (#408). Keyed on myMemberInfo?.id so the identity
  // only changes when the viewer's member row changes; MessageItem invokes it
  // with no arguments, so the member id is closed over here.
  const handleEditCharacter = useCallback(() => {
    if (!myMemberInfo?.id) return
    setShowMobileSidebar(true)
    setEditingMemberId(myMemberInfo.id)
  }, [myMemberInfo?.id])

  // Progressive paint (#346): header first (skeleton name while the channel
  // itself loads) plus skeleton message bubbles, instead of a full-screen
  // spinner that blanks everything including the header.
  if (channelLoading || messagesLoading) {
    return (
      <div className="flex h-[100dvh] overflow-hidden bg-white dark:bg-surface-800 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-surface-50 dark:bg-surface-900 border-r border-surface-200 dark:border-surface-700">
          <div className="px-4 sm:px-6 py-4 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center space-x-3 min-w-0">
              <Link to="/" replace className="text-surface-500 dark:text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors" aria-label="Back to Lobby">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              {channel ? (
                <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100 truncate">{channel.name}</h2>
              ) : (
                <div data-testid="channel-name-skeleton" className="h-6 w-40 rounded bg-surface-200 dark:bg-surface-700 animate-pulse" />
              )}
            </div>
          </div>
          <div data-testid="message-skeletons" aria-hidden="true" className="flex-1 overflow-y-auto p-4 space-y-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex space-x-3">
                <div className="h-8 w-8 rounded-full bg-surface-200 dark:bg-surface-700 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-24 rounded bg-surface-200 dark:bg-surface-700 animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-surface-200 dark:bg-surface-700 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (myMemberInfo?.is_blocked) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface-50 dark:bg-surface-900 px-4">
        <h2 className="text-xl font-medium text-surface-900 dark:text-surface-100 mb-2">Access Removed</h2>
        <p className="text-surface-500 dark:text-surface-400 mb-6">You&apos;ve been removed from this channel.</p>
        <Link to="/" replace className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 font-medium">Return to Lobby</Link>
      </div>
    )
  }

  if (error && !channel) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface-50 dark:bg-surface-900 px-4">
        <h2 className="text-xl font-medium text-surface-900 dark:text-surface-100 mb-2">Could not load this channel</h2>
        <p className="text-surface-500 dark:text-surface-400 mb-6">There was a problem fetching this channel.</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={refetch}
            className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm"
          >
            Retry
          </button>
          <Link
            to="/"
            replace
            className="inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 shadow-sm px-4 py-2 bg-white dark:bg-surface-800 text-base font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 sm:text-sm"
          >
            Back to Lobby
          </Link>
        </div>
      </div>
    )
  }

  if (error || !channel) {
    return <Navigate to="/" replace />
  }

  if (!myMemberInfo && !isGM) {
    return <Navigate to={`/join/${channel.id}`} replace />
  }

  // Omit the GM from the whisper target list (or omit the current user)
  const whisperableMembers = members.filter(m => m.user_id !== myMemberInfo?.user_id)

  // Active-player modal: selectable members are non-blocked, non-GM players
  // (the GM's own row is not a valid active player).
  const activePlayerMembers = members.filter(m => !m.is_blocked && m.user_id !== channel.gm_id)
  const currentActiveIds = members.filter(m => m.is_active_player && !m.is_blocked).map(m => m.user_id)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white dark:bg-surface-800 relative">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-50 dark:bg-surface-900 border-r border-surface-200 dark:border-surface-700">
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-3 min-w-0">
            <Link to="/" replace className="text-surface-500 dark:text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors" aria-label="Back to Lobby">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            {channel.avatar_url ? (
              <SignedImg
                src={channel.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
                data-testid="channel-header-avatar"
                className="h-9 w-9 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div data-testid="channel-header-avatar" className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-500 dark:text-primary-400 flex-shrink-0">
                {(channel.name[0] || '#').toUpperCase()}
              </div>
            )}
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100 truncate">{channel.name}</h2>
          </div>

          {/* Tools live in the sidebar menu (issue #382): search + roll history */}
          <div className="flex items-center">
            {/* Mobile Sidebar Toggle */}
            <button
              type="button"
              aria-label="Toggle sidebar menu"
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="lg:hidden text-surface-500 dark:text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 p-2 rounded-md bg-surface-50 dark:bg-surface-900 hover:bg-primary-50 dark:hover:bg-primary-950"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {channel.is_archived && (
          <div className="px-4 py-2 bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 text-sm text-center" role="status">
            This channel is archived and read-only. It can be restored by the GM.
          </div>
        )}

        <ChannelStatusBar
          channelId={channel.id}
          statusText={channel.status_text}
          activePlayers={members.filter(m => m.is_active_player && !m.is_blocked)}
          isGM={isGM}
          onUpdate={refetch}
        />

        {messagesError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center justify-between gap-3" role="alert">
            <span>{messagesRetrying ? 'Retrying…' : 'Failed to load messages. Try again.'}</span>
            <button
              type="button"
              onClick={refreshMessages}
              disabled={messagesRetrying}
              aria-label="Retry loading messages"
              className="flex-shrink-0 rounded-md border border-red-300 dark:border-red-700 px-2 py-1 font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        {alertActive && (
          <div className="px-4 py-2 bg-red-600 border-b border-red-700 dark:border-red-500 text-white text-sm flex items-center justify-between" role="alert">
            <span className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8l8 8M16 8l-8 8" />
              </svg>
              <span>
                X-Card triggered{alertCount > 1 ? ` (${alertCount})` : ''}.
              </span>
            </span>
            <button type="button" onClick={dismissAlert} className="relative text-white hover:text-red-100 p-1 after:content-[''] after:absolute after:-inset-2.5" aria-label="Dismiss X-Card alert">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <MessageList 
          messages={messages} 
          isGM={isGM} 
          onEdit={editMessage} 
          onDelete={deleteMessage} 
          onRollDice={sendDiceRoll}
          highlightMessageId={highlightMessageId}
          members={chatMembers}
          gameSystem={channel.game_system}
          reactionsByMessage={reactions}
          onToggleReaction={handleToggleReaction}
          onReply={handleReply}
          onJumpToMessage={handleJumpToMessage}
          lastReadAt={lastReadAt ?? myMemberInfo?.last_read_at}
          onRetry={retryMessage}
          onRemovePending={removePendingMessage}
          onRetryLoad={refreshMessages}
          // Open the mobile sidebar with the editor: the modal renders inside
          // the sidebar, whose translate-x-full transform would otherwise
          // become the containing block for its fixed positioning.
          onEditCharacter={myMemberInfo?.id ? handleEditCharacter : undefined}
          error={messagesError}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
        />
        
        {!channel.is_archived && (
          <MessageComposer 
            channelId={channel.id}
            isGM={isGM} 
            members={whisperableMembers} 
            npcs={npcs}
            onSendMessage={sendMessage} 
            onRollDice={sendDiceRoll}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onXCard={() => triggerXCard()}
          />
        )}
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div
          data-testid="sidebar-overlay"
          aria-hidden="true"
          className="fixed inset-0 bg-surface-600 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80 z-20 lg:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <div ref={sidebarRef} className={`
        absolute inset-y-0 right-0 z-30 w-80 bg-white dark:bg-surface-800 overflow-y-auto border-l border-surface-200 dark:border-surface-700
        transform transition-transform duration-300 ease-in-out motion-reduce:transition-none
        lg:relative lg:translate-x-0
        ${showMobileSidebar ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <MemberList 
          members={members} 
          isGM={isGM} 
          gmId={channel.gm_id}
          myUserId={myMemberInfo?.user_id}
          channelId={channel.id}
          onUpdate={refetch}
          gameSystem={channel.game_system}
          editingMemberId={editingMemberId}
          onEditMember={setEditingMemberId}
        />
        <div data-testid="sidebar-menu">
          {/* Table tools — available to everyone (issue #346) */}
          <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-400">Table</p>
          <div className="divide-y divide-surface-100 dark:divide-surface-700 border-t border-surface-100 dark:border-surface-700">
            {channel.map_url && (
              <a
                href={channel.map_url}
                target="_blank"
                rel="noreferrer"
                className={SIDEBAR_MENU_ITEM}
              >
                Map
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowRollHistory(true)}
              className={SIDEBAR_MENU_ITEM}
            >
              Rolls
            </button>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className={SIDEBAR_MENU_ITEM}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowNotificationSettings(true)}
              className={SIDEBAR_MENU_ITEM}
            >
              Notifications
            </button>
            {channel.resources_url && (
              <a
                href={channel.resources_url}
                target="_blank"
                rel="noreferrer"
                className={SIDEBAR_MENU_ITEM}
              >
                Resources
              </a>
            )}
            {channel.safety_tools_url && (
              <a
                href={channel.safety_tools_url}
                target="_blank"
                rel="noreferrer"
                className={SIDEBAR_MENU_ITEM}
              >
                Safety Tools Doc
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowSafetyTools(true)}
              className={SIDEBAR_MENU_ITEM}
            >
              Safety Tools
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className={SIDEBAR_MENU_ITEM}
            >
              Help
            </button>
          </div>

          {isGM && (
            <>
              {/* GM-only tools */}
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-400">GM Tools</p>
              <div className="divide-y divide-surface-100 dark:divide-surface-700 border-t border-surface-100 dark:border-surface-700">
                {gmOnlyResourcesUrl && (
                  <a
                    href={gmOnlyResourcesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={SIDEBAR_MENU_ITEM}
                  >
                    GM Resources
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowNpcs(true)}
                  className={SIDEBAR_MENU_ITEM}
                >
                  NPCs
                </button>
                <button
                  type="button"
                  onClick={() => setShowActivePlayer(true)}
                  className={SIDEBAR_MENU_ITEM}
                >
                  Active Player
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className={SIDEBAR_MENU_ITEM}
                >
                  Settings
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showNotificationSettings && (
        <ChannelNotificationSettingsModal
          channelId={channel.id}
          myMemberId={myMemberInfo?.id}
          onClose={() => setShowNotificationSettings(false)}
        />
      )}

      {showSettings && isGM && (
        <ChannelSettings 
          channel={channel} 
          gmOnlyResourcesUrl={gmOnlyResourcesUrl}
          onClose={() => setShowSettings(false)} 
          onUpdate={refetch}
        />
      )}

      {showRollHistory && (
        <RollHistoryModal
          channelId={channel.id}
          onClose={() => setShowRollHistory(false)}
        />
      )}

      {showSearch && (
        <SearchModal
          channelId={channel.id}
          onClose={() => setShowSearch(false)}
          onJumpToMessage={handleJumpToMessage}
        />
      )}

      {showSafetyTools && (
        <SafetyToolsModal
          channelId={channel.id}
          safetyToolsUrl={channel.safety_tools_url}
          isGM={isGM}
          onClose={() => setShowSafetyTools(false)}
        />
      )}

      {showHelp && (
        <ChannelHelpModal onClose={() => setShowHelp(false)} />
      )}

      {showNpcs && isGM && (
        <NpcManagementModal
          channelId={channel.id}
          onClose={() => setShowNpcs(false)}
          onUpdate={refetchNpcs}
        />
      )}

      {showActivePlayer && isGM && (
        <ActivePlayerModal
          channelId={channel.id}
          members={activePlayerMembers}
          currentActiveIds={currentActiveIds}
          onClose={() => setShowActivePlayer(false)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
