import { useParams, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useChannel } from './useChannel'
import { ChannelSettings } from './ChannelSettings'
import { MemberList } from './MemberList'

export function ChannelView() {
  const { id } = useParams<{ id: string }>()
  const { channel, members, loading, error, isGM, myMemberInfo } = useChannel(id)
  
  const [showSettings, setShowSettings] = useState(false)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error || !channel) {
    return <Navigate to="/" replace />
  }

  // If user is not in the members list (and somehow bypassed RLS to load this component), kick them out.
  // Actually, RLS will hide the channel if they aren't a member (unless it's public, in which case they can see channel, but can't see private stuff).
  // But wait, our RLS says "Public channels are viewable by everyone". 
  // However, `channel_members` is only viewable by members of the same channel.
  // If myMemberInfo is undefined, it means they haven't joined yet.
  if (!myMemberInfo && !isGM) {
    return <Navigate to={`/join/${channel.id}`} replace />
  }

  return (
    <div className="flex h-[calc(100vh-73px)] overflow-hidden bg-white">
      {/* Main Chat Area (Placeholder) */}
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

        <div className="flex-1 overflow-y-auto p-6">
          <div className="text-center text-gray-500 mt-20">
            Chat Area (Phase 5)
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 bg-white overflow-y-auto border-l border-gray-200">
        <MemberList 
          members={members} 
          isGM={isGM} 
          channelId={channel.id}
          myUserId={myMemberInfo?.user_id}
        />
      </div>

      {showSettings && isGM && (
        <ChannelSettings 
          channel={channel} 
          onClose={() => setShowSettings(false)} 
        />
      )}
    </div>
  )
}
