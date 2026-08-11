import { useParams, Navigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useChannel } from './useChannel'
import { ChannelSettings } from './ChannelSettings'
import { ChannelStatusBar } from './ChannelStatusBar'
import { MemberList } from './MemberList'
import { useMessages } from '../chat/useMessages'
import { MessageList } from '../chat/MessageList'
import { MessageComposer, type ReplyTarget } from '../chat/MessageComposer'

import { RollHistoryModal } from '../dice/RollHistoryModal'
import { SearchModal } from '../search/SearchModal'
import { ChannelNotificationSettingsModal } from '../notifications/ChannelNotificationSettingsModal'
import { useChannelNpcs } from './useChannelNpcs'
import { SafetyToolsModal } from './SafetyToolsModal'
import { useSafetyCardEvents } from './useSafetyCardEvents'

export function ChannelView() {
  const { id } = useParams<{ id: string }>()
  const { channel, members, loading: channelLoading, error, isGM, myMemberInfo, refetch } = useChannel(id)
  const { messages, reactions, loading: messagesLoading, error: messagesError, sendMessage, editMessage, deleteMessage, sendDiceRoll, addReaction, removeReaction } = useMessages(id)
  const { npcs } = useChannelNpcs(id)
  const { alertActive, alertCount, dismissAlert, triggerXCard } = useSafetyCardEvents(id, isGM)
  
  const [showSettings, setShowSettings] = useState(false)
  const [showRollHistory, setShowRollHistory] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [showSafetyTools, setShowSafetyTools] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)

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
    if (showSettings || showRollHistory || showSearch || showNotificationSettings || showSafetyTools) {
      setShowMobileSidebar(false)
    }
  }, [showSettings, showRollHistory, showSearch, showNotificationSettings, showSafetyTools])

  const handleJumpToMessage = (messageId: string) => {
    setHighlightMessageId(messageId)
  }

  const handleReply = (message: any) => {
    const senderName = members.find(m => m.user_id === message.sender_id)?.character_name || message.sender?.display_name || null
    setReplyTo({ id: message.id, content: message.content, senderName })
  }

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      const summary = reactions[messageId]?.find(r => r.emoji === emoji)
      if (summary?.hasReacted) {
        await removeReaction(messageId, emoji)
      } else {
        await addReaction(messageId, emoji)
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
    }
  }

  if (channelLoading || messagesLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
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

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white relative">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 border-r border-gray-200">
        <div className="px-4 sm:px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-3">
            <Link to="/" className="text-gray-500 hover:text-indigo-600 transition-colors" aria-label="Back to Lobby">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h2 className="text-xl font-bold text-gray-900">{channel.name}</h2>
          </div>
          
          {/* Mobile Sidebar Toggle */}
          <button
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="lg:hidden text-gray-500 hover:text-indigo-600 p-2 rounded-md bg-gray-50 hover:bg-indigo-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
        </div>

        <ChannelStatusBar
          channelId={channel.id}
          statusText={channel.status_text}
          activePlayers={members.filter(m => m.is_active_player && !m.is_blocked)}
          isGM={isGM}
          onUpdate={refetch}
        />

        {messagesError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm" role="alert">
            Failed to load messages. Refresh the page to try again.
          </div>
        )}

        {alertActive && (
          <div className="px-4 py-2 bg-red-600 border-b border-red-700 text-white text-sm flex items-center justify-between" role="alert">
            <span className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8l8 8M16 8l-8 8" />
              </svg>
              <span>
                X-Card triggered{alertCount > 1 ? ` (${alertCount})` : ''}. Handle the scene outside the chat.
              </span>
            </span>
            <button onClick={dismissAlert} className="text-white hover:text-red-100 p-1" aria-label="Dismiss X-Card alert">
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
          members={members}
          gameSystem={channel.game_system}
          reactionsByMessage={reactions}
          onToggleReaction={handleToggleReaction}
          onReply={handleReply}
          onJumpToMessage={handleJumpToMessage}
          lastReadAt={myMemberInfo?.last_read_at}
          onXCard={triggerXCard}
        />
        
        <MessageComposer 
          isGM={isGM} 
          members={whisperableMembers} 
          npcs={npcs}
          onSendMessage={sendMessage} 
          onRollDice={sendDiceRoll}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onXCard={() => triggerXCard()}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-20 lg:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        absolute inset-y-0 right-0 z-30 w-80 bg-white overflow-y-auto border-l border-gray-200
        transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0
        ${showMobileSidebar ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="lg:hidden flex justify-end p-2 border-b border-gray-100">
          <button onClick={() => setShowMobileSidebar(false)} className="text-gray-400 hover:text-gray-600 p-2">
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
        />
        <div data-testid="sidebar-menu" className="divide-y divide-gray-100 border-t border-gray-100">
          {isGM && channel.gm_only_resources_url && (
            <a
              href={channel.gm_only_resources_url}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              GM Resources
            </a>
          )}
          {channel.map_url && (
            <a
              href={channel.map_url}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Map
            </a>
          )}
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Notifications
          </button>
          {channel.resources_url && (
            <a
              href={channel.resources_url}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Resources
            </a>
          )}
          {channel.safety_tools_url && (
            <a
              href={channel.safety_tools_url}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Safety Tools Doc
            </a>
          )}
          <button
            onClick={() => setShowSafetyTools(true)}
            className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Safety Tools
          </button>
          <button
            onClick={() => setShowRollHistory(true)}
            className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Rolls
          </button>
          <button
            onClick={() => setShowSearch(true)}
            className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Search
          </button>
          {isGM && (
            <button
              onClick={() => setShowSettings(true)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Settings
            </button>
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
    </div>
  )
}
