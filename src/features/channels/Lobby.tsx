import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useChannels } from './useChannels'
import { CreateChannelModal } from './CreateChannelModal'
import { usePushNotifications } from '../auth/usePushNotifications'
import { PermissionBanner } from '../notifications/PermissionBanner'

export function Lobby() {
  const { publicChannels, myChannels, loading, error } = useChannels()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const { preferences } = usePushNotifications()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'my' | 'public'>('my')

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
  const filteredPublic = publicChannels.filter(c => c.name.toLowerCase().includes(q))

  return (
    <div className="w-full max-w-7xl mx-auto py-8 md:px-6 lg:px-8 relative min-h-[calc(100vh-73px)]">
      <div className="flex flex-col gap-6">
        <PermissionBanner />
        <div className="border-b border-gray-200 px-4 md:px-0">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('my')}
              className={`${
                activeTab === 'my'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              My Channels
              <span className={`ml-3 py-0.5 px-2.5 rounded-full text-xs font-medium md:inline-block ${activeTab === 'my' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-900'}`}>
                {filteredMy.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('public')}
              className={`${
                activeTab === 'public'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Public Channels
              <span className={`ml-3 py-0.5 px-2.5 rounded-full text-xs font-medium md:inline-block ${activeTab === 'public' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-900'}`}>
                {filteredPublic.length}
              </span>
            </button>
          </nav>
        </div>

        {activeTab === 'my' && (
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
                        <div className="flex items-center justify-between">
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
                          <div className="ml-2 flex-shrink-0 flex">
                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Joined as {channel.member.character_name}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex">
                            <p className="flex items-center text-sm text-gray-500">
                              {channel.is_public ? 'Public' : 'Private'}
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
        )}

        {activeTab === 'public' && (
          <div className="bg-white border-y border-gray-200 md:border-none md:shadow overflow-hidden md:rounded-md">
            {filteredPublic.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                {q ? 'No matching public channels found.' : 'No public channels available.'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredPublic.map((channel) => {
                  const isMember = myChannels.some(my => my.id === channel.id)
                  
                  return (
                    <li key={channel.id}>
                      <Link 
                        to={isMember ? `/channel/${channel.id}` : `/join/${channel.id}`} 
                        className="block hover:bg-gray-50 transition-colors"
                      >
                        <div className="px-4 py-4 sm:px-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-indigo-600 truncate">
                              {channel.name}
                            </p>
                            {!isMember && (
                              <div className="ml-2 flex-shrink-0 flex">
                                {channel.has_password && (
                                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => setIsCreateModalOpen(true)}
        className="fixed bottom-6 right-6 inline-flex items-center justify-center p-4 border border-transparent rounded-full shadow-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors z-40"
        aria-label="Create Channel"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {isCreateModalOpen && (
        <CreateChannelModal onClose={() => setIsCreateModalOpen(false)} />
      )}
    </div>
  )
}
