import { useParams, Navigate, Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useChannel } from './useChannel'
import { ChannelSettings } from './ChannelSettings'
import { ChannelStatusBar } from './ChannelStatusBar'
import { MemberList } from './MemberList'
import { EditCharacterModal } from './EditCharacterModal'
import { useMessages } from '../chat/useMessages'
import { MessageList } from '../chat/MessageList'
import { MessageComposer, type ReplyTarget } from '../chat/MessageComposer'
import type { ChatMessage, Member } from '../chat/types'
import { useAuth } from '../auth/useAuth'
import { SignedImg } from '../../components/SignedImg'
import { usePushNotifications } from '../auth/usePushNotifications'
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

  const { channel, members, loading: channelLoading, error, isGM, myMemberInfo, lastReadAt, refetch, gmOnlyResourcesUrl } = useChannel(id, handleChannelRead)
  const { messages, reactions, loading: messagesLoading, error: messagesError, hasMore, loadingOlder, loadOlder, sendMessage, editMessage, deleteMessage, sendDiceRoll, addReaction, removeReaction, retryMessage, removePendingMessage } = useMessages(id)
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
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  // Character editor opened from the composer's own avatar (bottom sheet).
  const [showCharacterSheet, setShowCharacterSheet] = useState(false)
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

  // Progressive paint (#346): header first (skeleton name while the channel
  // itself loads) plus skeleton message bubbles, instead of a full-screen
  // spinner that blanks everything including the header.
  if (channelLoading || messagesLoading) {
    return (
      <div className="flex h-[100dvh] overflow-hidden bg-white dark:bg-gray-800 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
          <div className="px-4 sm:px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center space-x-3 min-w-0">
              <Link to="/" replace className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" aria-label="Back to Lobby">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              {channel ? (
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{channel.name}</h2>
              ) : (
                <div data-testid="channel-name-skeleton" className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
              )}
            </div>
          </div>
          <div data-testid="message-skeletons" aria-hidden="true" className="flex-1 overflow-y-auto p-4 space-y-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex space-x-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
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
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 px-4">
        <h2 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">Access Removed</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">You&apos;ve been removed from this channel.</p>
        <Link to="/" replace className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium">Return to Lobby</Link>
      </div>
    )
  }

  if (error && !channel) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 px-4">
        <h2 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">Could not load this channel</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">There was a problem fetching this channel.</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={refetch}
            className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
          >
            Retry
          </button>
          <Link
            to="/"
            replace
            className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 sm:text-sm"
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
    <div className="flex h-[100dvh] overflow-hidden bg-white dark:bg-gray-800 relative">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-3 min-w-0">
            <Link to="/" replace className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" aria-label="Back to Lobby">
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
              <div data-testid="channel-header-avatar" className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                {(channel.name[0] || '#').toUpperCase()}
              </div>
            )}
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{channel.name}</h2>
          </div>

          {/* One-tap tools in the header (issue #346): search + roll history */}
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Search messages"
              title="Search messages"
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Roll history"
              title="Roll history"
              onClick={() => setShowRollHistory(true)}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} />
                <circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="9" cy="15" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none" />
              </svg>
            </button>

            {/* Mobile Sidebar Toggle */}
            <button
              type="button"
              aria-label="Toggle sidebar menu"
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2 rounded-md bg-gray-50 dark:bg-gray-900 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {channel.is_archived && (
          <div className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm text-center" role="status">
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
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm" role="alert">
            Failed to load messages. Refresh the page to try again.
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
                X-Card triggered{alertCount > 1 ? ` (${alertCount})` : ''}. Handle the scene outside the chat.
              </span>
            </span>
            <button type="button" onClick={dismissAlert} className="text-white hover:text-red-100 p-1" aria-label="Dismiss X-Card alert">
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
          onXCard={triggerXCard}
          onRetry={retryMessage}
          onRemovePending={removePendingMessage}
          // Open the mobile sidebar with the editor: the modal renders inside
          // the sidebar, whose translate-x-full transform would otherwise
          // become the containing block for its fixed positioning.
          onEditCharacter={myMemberInfo?.id ? () => { setShowMobileSidebar(true); setEditingMemberId(myMemberInfo.id) } : undefined}
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
            // Tapping your own character avatar opens the editor as a sheet.
            myCharacterName={myMemberInfo?.character_name}
            myCharacterAvatarUrl={myMemberInfo?.character_avatar_url ?? null}
            onOpenCharacterSheet={myMemberInfo ? () => setShowCharacterSheet(true) : undefined}
          />
        )}
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 z-20 lg:hidden"
          onClick={() => setShowMobileSidebar(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setShowMobileSidebar(false)
              e.preventDefault()
            }
          }}
        />
      )}

      {/* Sidebar */}
      <div className={`
        absolute inset-y-0 right-0 z-30 w-80 bg-white dark:bg-gray-800 overflow-y-auto border-l border-gray-200 dark:border-gray-700
        transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0
        ${showMobileSidebar ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="lg:hidden flex justify-end p-2 border-b border-gray-100 dark:border-gray-700">
          <button type="button" onClick={() => setShowMobileSidebar(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
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
          <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Table</p>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
            {channel.map_url && (
              <a
                href={channel.map_url}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Map
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowRollHistory(true)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Rolls
            </button>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowNotificationSettings(true)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Notifications
            </button>
            {channel.resources_url && (
              <a
                href={channel.resources_url}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Resources
              </a>
            )}
            {channel.safety_tools_url && (
              <a
                href={channel.safety_tools_url}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Safety Tools Doc
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowSafetyTools(true)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Safety Tools
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Help
            </button>
          </div>

          {isGM && (
            <>
              {/* GM-only tools */}
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">GM Tools</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
                {gmOnlyResourcesUrl && (
                  <a
                    href={gmOnlyResourcesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    GM Resources
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowNpcs(true)}
                  className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  NPCs
                </button>
                <button
                  type="button"
                  onClick={() => setShowActivePlayer(true)}
                  className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Active Player
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Settings
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showCharacterSheet && myMemberInfo && (
        <EditCharacterModal
          member={myMemberInfo}
          gameSystem={channel.game_system}
          onClose={() => setShowCharacterSheet(false)}
          onUpdate={refetch}
          asSheet
        />
      )}

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
