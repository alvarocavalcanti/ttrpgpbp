import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useChannels } from './useChannels'
import { CreateChannelModal } from './CreateChannelModal'

export function Lobby() {
  const { publicChannels, myChannels, loading } = useChannels()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Campaigns Lobby</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          Create Channel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* My Channels */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">My Channels</h3>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            {myChannels.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                You haven't joined any channels yet.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {myChannels.map((channel) => (
                  <li key={channel.id}>
                    <Link to={`/channel/${channel.id}`} className="block hover:bg-gray-50 transition-colors">
                      <div className="px-4 py-4 sm:px-6">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-indigo-600 truncate">
                            {channel.name}
                          </p>
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
        </div>

        {/* Public Channels */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Public Channels</h3>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            {publicChannels.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No public channels available.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {publicChannels.map((channel) => {
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
                                {channel.password_hash && (
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
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateChannelModal onClose={() => setIsCreateModalOpen(false)} />
      )}
    </div>
  )
}
