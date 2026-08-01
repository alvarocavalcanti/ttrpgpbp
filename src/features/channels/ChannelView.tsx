import { useParams, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useChannel } from './useChannel'
import { ChannelSettings } from './ChannelSettings'
import { ChannelStatusBar } from './ChannelStatusBar'
import { MemberList } from './MemberList'
import { useMessages } from '../chat/useMessages'
import { MessageList } from '../chat/MessageList'
import { MessageComposer } from '../chat/MessageComposer'

export function ChannelView() {
  const { id } = useParams<{ id: string }>()
  const { channel, members, loading: channelLoading, error, isGM, myMemberInfo, refetch } = useChannel(id)
  const { messages, loading: messagesLoading, sendMessage, editMessage, deleteMessage, sendDiceRoll } = useMessages(id)
  
  const [showSettings, setShowSettings] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)

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
    <div className="flex h-[calc(100vh-73px)] overflow-hidden bg-white relative">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 border-r border-gray-200">
        <div className="px-4 sm:px-6 py-4 bg-white border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm z-10 gap-3">
          <div className="flex justify-between w-full sm:w-auto items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{channel.name}</h2>
            </div>
            
            {/* Mobile Sidebar Toggle */}
            <button
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="lg:hidden text-gray-500 hover:text-indigo-600 p-2 rounded-md bg-gray-50 hover:bg-indigo-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {channel.resources_url && (
              <a 
                href={channel.resources_url} 
                target="_blank" 
                rel="noreferrer"
                className="text-gray-500 hover:text-indigo-600 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-50 hover:bg-indigo-50 transition-colors"
              >
                Resources
              </a>
            )}
            {channel.map_url && (
              <a 
                href={channel.map_url} 
                target="_blank" 
                rel="noreferrer"
                className="text-gray-500 hover:text-indigo-600 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-50 hover:bg-indigo-50 transition-colors"
              >
                Map
              </a>
            )}
            {isGM && (
              <button
                onClick={() => setShowSettings(true)}
                className="text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                Settings
              </button>
            )}
          </div>
        </div>

        <ChannelStatusBar
          channelId={channel.id}
          statusText={channel.status_text}
          activePlayers={members.filter(m => m.is_active_player && !m.is_blocked)}
          isGM={isGM}
          onUpdate={refetch}
        />

        <MessageList 
          messages={messages} 
          isGM={isGM} 
          onEdit={editMessage} 
          onDelete={deleteMessage} 
          onRollDice={sendDiceRoll}
        />
        
        <MessageComposer 
          isGM={isGM} 
          members={whisperableMembers} 
          onSendMessage={sendMessage} 
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
          onUpdate={refetch}
        />
      </div>

      {showSettings && isGM && (
        <ChannelSettings 
          channel={channel} 
          onClose={() => setShowSettings(false)} 
          onUpdate={refetch}
        />
      )}
    </div>
  )
}

