import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useChannels } from './useChannels'
import { CreateChannelModal } from './CreateChannelModal'
import { usePushNotifications } from '../notifications/usePushNotifications'
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

// Short lobby timestamp (WhatsApp-style): HH:MM if the message is from today,
// DD/MM/YYYY otherwise. Formatted manually (not locale/time-zone dependent) so
// the 24-hour HH:MM is stable across browsers.
function channelTimestamp(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

// Compact unread count: exact up to 99, then capped.
function unreadBadgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

// Plain-text preview of the most recent message; CSS `truncate` adds the ellipsis.
function channelPreview(preview?: string | null): string {
  if (!preview) return 'No messages yet'
  return preview
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .trim()
}

export function Lobby() {
  const { myChannels, loading, error, refetch } = useChannels()
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64" role="alert">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-6 py-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-3">
          <span>Couldn't load channels.</span>
          <button type="button" onClick={refetch} className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  const q = searchParams.get('q')?.toLowerCase() || ''
  const filteredMy = myChannels.filter(c => c.name.toLowerCase().includes(q))

  return (
    <div className="w-full max-w-7xl mx-auto pt-0 pb-8 md:px-6 lg:px-8 relative flex-1">
      <div className="flex flex-col gap-6">
        <PermissionBanner />
        <div className="bg-white dark:bg-surface-800 border-y border-surface-200 dark:border-surface-700 md:border-none md:shadow overflow-hidden md:rounded-md">
          {filteredMy.length === 0 ? (
            q ? (
              <div className="p-6 text-center text-surface-500 dark:text-surface-400 text-sm">
                No matching channels found.
              </div>
            ) : (
              // First-run empty state: explains the invite-only model and
              // surfaces both paths (create / join) at the moment of confusion.
              <div className="p-8 text-center" data-testid="empty-lobby">
                <svg
                  className="mx-auto h-16 w-16 text-primary-200 dark:text-primary-800"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4m0 0l8-4m-8 4v10" />
                </svg>
                <h2 className="mt-4 text-lg font-medium text-surface-900 dark:text-surface-100">You haven&apos;t joined any channels yet.</h2>
                <p className="mt-1 text-sm text-surface-500 dark:text-surface-400 max-w-sm mx-auto">
                  Start your own game, or ask your GM for an invite link to join theirs.
                </p>
                <div className="mt-5 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    data-testid="empty-lobby-create"
                    onClick={handleCreateClick}
                    className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
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
                      className="flex-1 w-full min-w-0 bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-md shadow-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button
                      type="submit"
                      className="inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 shadow-sm px-4 py-2 bg-white dark:bg-surface-800 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      Join
                    </button>
                  </form>
                  {inviteError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{inviteError}</p>}
                </div>
              </div>
            )
          ) : (
            <ul className="divide-y divide-surface-200 dark:divide-surface-700">
              {filteredMy.map((channel) => (
                <li key={channel.id}>
                  <Link to={`/channel/${channel.id}`} className="block hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                    <div className="flex items-center px-4 py-3 sm:px-6">
                      {channel.avatar_url ? (
                        <SignedImg
                          src={channel.avatar_url}
                          alt=""
                          referrerPolicy="no-referrer"
                          data-testid="channel-avatar"
                          className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div data-testid="channel-avatar" className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-500 dark:text-primary-400 flex-shrink-0">
                          {(channel.name[0] || '#').toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 ml-3 flex flex-col justify-center">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-primary-600 dark:text-primary-400 truncate">
                              {channel.name}
                            </span>
                            {channel.gm_id === user?.id && (
                              <span className="inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] leading-4 font-semibold uppercase bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                                GM
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-surface-400 dark:text-surface-400 flex-shrink-0">
                            {channelTimestamp(channel.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[15px] text-surface-500 dark:text-surface-400 truncate">
                            {channelPreview(channel.last_message_preview)}
                          </span>
                          {preferences?.badge_enabled !== false && channel.unread_count && channel.unread_count > 0 ? (
                            <span
                              role="img"
                              aria-label={`${unreadBadgeLabel(channel.unread_count)} unanswered`}
                              className="inline-flex flex-shrink-0 items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-semibold bg-red-600 text-white"
                            >
                              {unreadBadgeLabel(channel.unread_count)}
                            </span>
                          ) : null}
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
          className={`inline-flex items-center justify-center p-4 border border-transparent rounded-full shadow-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors ${
            atChannelCap
              ? 'bg-surface-400 dark:bg-surface-600'
              : 'bg-primary-600 hover:bg-primary-700'
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
