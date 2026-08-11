import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useChannels } from './useChannels'
import { CreateChannelModal } from './CreateChannelModal'
import { usePushNotifications } from '../auth/usePushNotifications'
import { PermissionBanner } from '../notifications/PermissionBanner'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../auth/useAuth'
import { useAppSetting } from '../../hooks/useAppSetting'
import { MAX_CHANNELS_PER_USER } from '../../constants'

export function Lobby() {
  const { myChannels, loading, error } = useChannels()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const { preferences } = usePushNotifications()
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()
  const { value: maxChannels } = useAppSetting<number>('max_channels_per_user', MAX_CHANNELS_PER_USER)

  const atChannelCap = !profile?.server_admin && myChannels.length >= maxChannels

  const handleCreateClick = () => {
    if (atChannelCap) {
      addToast(`Channel limit reached (${maxChannels} max). Contact the server admin.`, 'error')
      return
    }
    setIsCreateModalOpen(true)
  }

  useEffect(() => {
    // Set App Badge if supported and enabled
    if ('setAppBadge' in navigator && preferences?.badge_enabled !== false) {
      const totalUnread = myChannels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0)
      if (totalUnread > 0) {
        navigator.setAppBadge(totalUnread).catch(console.error)
      } else {
        navigator.clearAppBadge().catch(console.error)
      }
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(console.error)
    }
  }, [myChannels, preferences])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64" role="alert">
        <div className="bg-red-50 border border-red-200 rounded-md px-6 py-4 text-sm text-red-700">
          Failed to load channels. Refresh the page to try again.
        </div>
      </div>
    )
  }

  const q = searchParams.get('q')?.toLowerCase() || ''
  const filteredMy = myChannels.filter(c => c.name.toLowerCase().includes(q))

  return (
    <div className="w-full max-w-7xl mx-auto pt-0 pb-8 md:px-6 lg:px-8 relative min-h-[calc(100vh-73px)]">
      <div className="flex flex-col gap-6">
        <PermissionBanner />
        <div className="bg-white border-y border-gray-200 md:border-none md:shadow overflow-hidden md:rounded-md">
          {filteredMy.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              {q ? 'No matching channels found.' : "You haven't joined any channels yet."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredMy.map((channel) => (
                <li key={channel.id}>
                  <Link to={`/channel/${channel.id}`} className="block hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex flex-col space-y-1 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                        <div className="flex items-center space-x-3">
                          <p className="text-sm font-medium text-indigo-600 truncate">
                            {channel.name}
                          </p>
                          {preferences?.badge_enabled !== false && channel.unread_count && channel.unread_count > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {channel.unread_count} new
                            </span>
                          ) : null}
                        </div>
                        <div className="ml-2 flex-shrink-0 flex flex-wrap items-center justify-end gap-2">
                          {channel.gm_id === user?.id ? (
                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                              GM
                            </p>
                          ) : (
                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-600">
                              Player
                            </p>
                          )}
                          <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Joined as {channel.member.character_name}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={handleCreateClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleCreateClick()
            e.preventDefault()
          }
        }}
        data-testid="create-channel-fab"
        className="fixed bottom-6 right-6 z-40"
      >
        <button
          type="button"
          disabled={atChannelCap}
          aria-label="Create Channel"
          className={`inline-flex items-center justify-center p-4 border border-transparent rounded-full shadow-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:cursor-not-allowed ${
            atChannelCap
              ? 'bg-gray-400'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {isCreateModalOpen && (
        <CreateChannelModal onClose={() => setIsCreateModalOpen(false)} />
      )}
    </div>
  )
}
