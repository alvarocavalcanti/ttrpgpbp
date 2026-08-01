import { useParams, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useChannel } from './useChannel'
import { ChannelSettings } from './ChannelSettings'
import { MemberList } from './MemberList'
import { useMessages } from '../chat/useMessages'
import { MessageList } from '../chat/MessageList'
import { MessageComposer } from '../chat/MessageComposer'

export function ChannelView() {
  const { id } = useParams<{ id: string }>()
  const { channel, members, loading: channelLoading, error, isGM, myMemberInfo, refetch } = useChannel(id)
  const { messages, loading: messagesLoading, sendMessage, editMessage, deleteMessage } = useMessages(id)
  
  const [showSettings, setShowSettings] = useState(false)

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
    <div className="flex h-[calc(100vh-73px)] overflow-hidden bg-white">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 border-r border-gray-200">
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{channel.name}</h2>
            {channel.status_text && (
              <p className="text-sm text-gray-500 mt-1">{channel.status_text}</p>
            )}
          </div>
          
          <div className="flex space-x-3">
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

        <MessageList 
          messages={messages} 
          isGM={isGM} 
          onEdit={editMessage} 
          onDelete={deleteMessage} 
        />
        
        <MessageComposer 
          isGM={isGM} 
          members={whisperableMembers} 
          onSendMessage={sendMessage} 
        />
      </div>

      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 bg-white overflow-y-auto border-l border-gray-200">
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

