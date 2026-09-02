import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useChannels } from './useChannels'
import { CreateChannelModal } from './CreateChannelModal'
import { usePushNotifications } from '../auth/usePushNotifications'
import { PermissionBanner } from '../notifications/PermissionBanner'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../auth/useAuth'
import { useAppSetting } from '../../hooks/useAppSetting'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { SignedImg } from '../../components/SignedImg'
import { updateAppBadge } from '../../lib/appBadge'
import { MAX_CHANNELS_PER_USER, MAX_URL_LENGTH } from '../../constants'

// Invite links point at /join/:channelId; users paste the whole URL.
const INVITE_LINK_PATTERN = /\/join\/([0-9a-fA-F-]{8,64})/

export function Lobby() {
  const { myChannels, loading, error } = useChannels()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { preferences } = usePushNotifications()
  const { user } = useAuth()
  const { isServerAdmin } = useIsServerAdmin()
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()
  const { value: maxChannels } = useAppSetting<number>('max_channels_per_user', MAX_CHANNELS_PER_USER)

  const atChannelCap = !isServerAdmin && myChannels.length >= maxChannels

  const handleCreateClick = () => {
    if (atChannelCap) {
      addToast(`Channel limit reached (${maxChannels} max). Contact the server admin.`, 'error')
      return
    }
    setIsCreateModalOpen(true)
  }

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const match = inviteInput.trim().match(INVITE_LINK_PATTERN)
    if (!match) {
      setInviteError("That doesn't look like an invite link. Ask your GM for a link that contains /join/.")
      return
    }
    setInviteError(null)
    navigate(`/join/${match[1]}`)
  }

  useEffect(() => {
    // Set App Badge if supported and enabled
    const totalUnread = myChannels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0)
    updateAppBadge(totalUnread, preferences?.badge_enabled !== false)
  }, [myChannels, preferences])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64" role="alert">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-6 py-4 text-sm text-red-700 dark:text-red-400">
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
        <div className="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700 md:border-none md:shadow overflow-hidden md:rounded-md">
          {filteredMy.length === 0 ? (
            q ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                No matching channels found.
              </div>
            ) : (
              // First-run empty state: explains the invite-only model and
              // surfaces both paths (create / join) at the moment of confusion.
              <div className="p-8 text-center" data-testid="empty-lobby">
                <svg
                  className="mx-auto h-16 w-16 text-indigo-200 dark:text-indigo-800"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4m0 0l8-4m-8 4v10" />
                </svg>
                <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">You haven&apos;t joined any channels yet.</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  Start your own game, or ask your GM for an invite link to join theirs.
                </p>
                <div className="mt-5 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    data-testid="empty-lobby-create"
                    onClick={handleCreateClick}
                    className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Create a channel
                  </button>
                  <form className="w-full max-w-sm flex gap-2" onSubmit={handleInviteSubmit}>
                    <input
                      type="text"
                      aria-label="Paste an invite link"
                      placeholder="Paste an invite link"
                      maxLength={MAX_URL_LENGTH}
                      value={inviteInput}
                      onChange={(e) => {
                        setInviteInput(e.target.value)
                        setInviteError(null)
                      }}
                      className="flex-1 w-full min-w-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Join
                    </button>
                  </form>
                  {inviteError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{inviteError}</p>}
                </div>
              </div>
            )
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredMy.map((channel) => (
                <li key={channel.id}>
                  <Link to={`/channel/${channel.id}`} className="block hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex flex-col space-y-1 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                        <div className="flex items-center space-x-3 min-w-0">
                          {channel.avatar_url ? (
                            <SignedImg
                              src={channel.avatar_url}
                              alt=""
                              referrerPolicy="no-referrer"
                              data-testid="channel-avatar"
                              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div data-testid="channel-avatar" className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                              {(channel.name[0] || '#').toUpperCase()}
                            </div>
                          )}
                          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 truncate">
                            {channel.name}
                          </p>
                          {preferences?.badge_enabled !== false && channel.unread_count && channel.unread_count > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">
                              {channel.unread_count} new
                            </span>
                          ) : null}
                        </div>
                        <div className="ml-2 flex-shrink-0 flex flex-wrap items-center justify-end gap-2">
                          {channel.gm_id === user?.id ? (
                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                              GM
                            </p>
                          ) : (
                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              Player
                            </p>
                          )}
                          <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 max-w-full min-w-0">
                            {/* Truncate on narrow screens so a long character name can't dominate the row */}
                            <span className="truncate max-w-[50vw] sm:max-w-none">Joined as {channel.member.character_name}</span>
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

      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          data-testid="create-channel-fab"
          aria-disabled={atChannelCap}
          onClick={handleCreateClick}
          aria-label="Create Channel"
          className={`inline-flex items-center justify-center p-4 border border-transparent rounded-full shadow-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors ${
            atChannelCap
              ? 'bg-gray-400 dark:bg-gray-600'
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
