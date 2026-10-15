import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useChannels } from './useChannels'
import { usePublicChannels } from './usePublicChannels'
import { CreateChannelModal } from './CreateChannelModal'
import { PublicChannelDetailSheet } from './PublicChannelDetailSheet'
import { gameSystemLabel, channelTimestamp } from './lobbyFormat'
import { usePushNotifications } from '../notifications/usePushNotifications'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../auth/useAuth'
import { useAppSetting } from '../../hooks/useAppSetting'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { SignedImg } from '../../components/SignedImg'
import { refreshAppBadge } from '../../lib/channelRead'
import { scrubSpoilers } from '../../lib/spoilerScrub'
import { trackEvent } from '../../lib/analytics'
import { GAME_SYSTEM_OPTIONS } from '../../game-systems'
import { MAX_CHANNELS_PER_USER, MAX_URL_LENGTH } from '../../constants'

// Invite links point at /join/:channelId; users paste the whole URL.
const INVITE_LINK_PATTERN = /\/join\/([0-9a-fA-F-]{8,64})/

type LobbyTab = 'my' | 'discover'

const TABS: { id: LobbyTab; label: string }[] = [
  { id: 'my', label: 'My Games' },
  { id: 'discover', label: 'Discover' },
]

// Compact unread count: exact up to 99, then capped.
function unreadBadgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

// Screen-reader label for the count pill: "1 unread message" /
// "N unread messages" (the capped "99+" form stays plural).
function unreadBadgeAria(count: number): string {
  return `${unreadBadgeLabel(count)} unread ${count === 1 ? 'message' : 'messages'}`
}

// Plain-text preview of the most recent message; CSS `truncate` adds the ellipsis.
// Spoiler content (`||…||`, issue #709) collapses to a marker so lobby rows
// never leak a secret. The DB caps the stored preview at 120 chars of raw
// markdown, so a long message can slice a mention/link chip in half (#606):
// strip both complete `[label](url)` tokens and the two dangling shapes the
// truncation leaves behind — `[label](url` (no closing paren) and `[label`
// (no closing bracket). The same truncation can orphan a spoiler's closing
// `||` — or cut right after its first closing bar — so any dangling opener
// scrubs to the marker too, pipes and all. Code spans split out first: a `||`
// inside code must never pair with a spoiler delimiter.
function channelPreview(preview?: string | null): string {
  if (!preview) return 'No messages yet'
  return scrubSpoilers(preview, true)
    .replace(/!?\[([^\]]*)\](?:\([^)]*\)?)?/g, '$1')
    .replace(/!?\[([^\]]*)$/g, '$1')
    .replace(/[*_`#>[\]]/g, '')
    .trim()
}

interface FirstRunPromptProps {
  onCreate: () => void
  inviteInput: string
  setInviteInput: (value: string) => void
  inviteError: string | null
  setInviteError: (value: string | null) => void
  onInviteSubmit: (e: React.FormEvent) => void
}

// First-run empty state: explains the invite-only model and surfaces both paths
// (create / join). Shown on My Games whenever the user has no channels, and on
// Discover for a user who has joined none yet (#674).
function FirstRunPrompt({
  onCreate,
  inviteInput,
  setInviteInput,
  inviteError,
  setInviteError,
  onInviteSubmit,
}: FirstRunPromptProps) {
  return (
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
          onClick={onCreate}
          className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Create a channel
        </button>
        <form className="w-full max-w-sm flex gap-2" onSubmit={onInviteSubmit}>
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
}

/**
 * Home screen: My Games (the channels the user has joined, with last-message
 * preview, timestamp, and unread pill, plus create/invite entry points) and
 * Discover (listed, apply-only channels, #674). Search filtering comes from the
 * `?q=` URL param; the active tab comes from `?tab=discover`.
 */
export function Lobby() {
  const { myChannels, loading, error, refetch } = useChannels()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [gameSystem, setGameSystem] = useState('')
  const [selectedListing, setSelectedListing] = useState<{ id: string; gameSystem: string | null } | null>(null)
  const navigate = useNavigate()
  const { preferences } = usePushNotifications()
  const { user } = useAuth()
  const { isServerAdmin } = useIsServerAdmin()
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const { value: maxChannels } = useAppSetting<number>('max_channels_per_user', MAX_CHANNELS_PER_USER)

  const atChannelCap = !isServerAdmin && myChannels.length >= maxChannels

  const qRaw = searchParams.get('q') ?? ''
  const q = qRaw.toLowerCase()

  // My Games is the default; a user with no channels yet lands on Discover
  // instead of an empty list. An in-flight or failed My Games load keeps the
  // user on their own tab so they see the spinner / Retry.
  const requestedTab: LobbyTab = searchParams.get('tab') === 'discover' ? 'discover' : 'my'
  const activeTab: LobbyTab =
    requestedTab === 'my' && !loading && !error && myChannels.length === 0 ? 'discover' : requestedTab

  const discover = usePublicChannels({ search: qRaw, gameSystem, enabled: activeTab === 'discover' })

  useEffect(() => {
    // Disambiguates the shared `/` path, whose query string is stripped from the
    // GA page_view (#674).
    trackEvent('lobby_tab_view', { tab: activeTab })
  }, [activeTab])

  const selectTab = (tab: LobbyTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'discover') next.set('tab', 'discover')
      else next.delete('tab')
      return next
    }, { replace: true })
  }

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
    // Launcher badge totals channel messages plus admin threads (#517), so
    // refresh it from the server total rather than the lobby's channel-only
    // sum. The lobby's live messages refetch keeps this current while sitting
    // here.
    if (!user?.id) return
    void refreshAppBadge(user.id, preferences?.badge_enabled !== false)
  }, [myChannels, preferences, user?.id])

  const firstRunPrompt = (
    <FirstRunPrompt
      onCreate={handleCreateClick}
      inviteInput={inviteInput}
      setInviteInput={setInviteInput}
      inviteError={inviteError}
      setInviteError={setInviteError}
      onInviteSubmit={handleInviteSubmit}
    />
  )

  const filteredMy = myChannels.filter(c => c.name.toLowerCase().includes(q))

  return (
    <div className="w-full max-w-7xl mx-auto pt-0 pb-8 md:px-6 lg:px-8 relative flex-1">
      <div className="flex flex-col gap-6">
        <div className="border-b border-surface-200 dark:border-surface-700 px-4 md:px-0">
          <nav className="-mb-px flex space-x-8" aria-label="Lobby sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300 hover:border-surface-300 dark:hover:border-surface-600'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'my' ? (
          <div className="bg-white dark:bg-surface-800 border-y border-surface-200 dark:border-surface-700 md:border-none md:shadow overflow-hidden md:rounded-md">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
              </div>
            ) : error ? (
              <div className="flex justify-center items-center h-64" role="alert">
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-6 py-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-3">
                  <span>Couldn't load channels.</span>
                  <button type="button" onClick={refetch} className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold hover:underline">Retry</button>
                </div>
              </div>
            ) : filteredMy.length === 0 ? (
              q ? (
                <div className="p-6 text-center text-surface-500 dark:text-surface-400 text-sm">
                  No matching channels found.
                </div>
              ) : (
                firstRunPrompt
              )
            ) : (
              <ul className="divide-y divide-surface-200 dark:divide-surface-700">
                {filteredMy.map((channel) => (
                  <li key={channel.id}>
                    <Link to={`/channel/${channel.id}`} className="block hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                      <div className="flex items-center px-3 py-3 sm:px-6">
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
                              <span className="text-base font-medium text-primary-600 dark:text-primary-400 truncate">
                                {channel.name}
                              </span>
                              {channel.gm_id === user?.id && (
                                <span className="inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[0.625rem] leading-4 font-semibold uppercase bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                                  GM
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-surface-400 dark:text-surface-400 flex-shrink-0">
                              {channelTimestamp(channel.last_message_at)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-surface-500 dark:text-surface-400 truncate">
                              {channelPreview(channel.last_message_preview)}
                            </span>
                            {preferences?.badge_enabled !== false && channel.unread_count && channel.unread_count > 0 ? (
                              <span
                                role="img"
                                aria-label={unreadBadgeAria(channel.unread_count)}
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
        ) : (
          <div className="flex flex-col gap-3">
            {myChannels.length === 0 && (
              <div className="bg-white dark:bg-surface-800 border-y border-surface-200 dark:border-surface-700 md:border-none md:shadow overflow-hidden md:rounded-md">
                {firstRunPrompt}
              </div>
            )}

            <div className="bg-white dark:bg-surface-800 border-y border-surface-200 dark:border-surface-700 md:border-none md:shadow overflow-hidden md:rounded-md">
              <div className="px-3 py-3 sm:px-6 border-b border-surface-200 dark:border-surface-700">
                <label htmlFor="discoverSystem" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  Game system
                </label>
                <select
                  id="discoverSystem"
                  value={gameSystem}
                  onChange={(e) => setGameSystem(e.target.value)}
                  className="mt-1 bg-white dark:bg-surface-800 block w-full sm:max-w-xs border-surface-300 dark:border-surface-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border"
                >
                  <option value="">All game systems</option>
                  {GAME_SYSTEM_OPTIONS.map((system) => (
                    <option key={system.id} value={system.id}>{system.name}</option>
                  ))}
                </select>
              </div>

              {discover.loading ? (
                <div className="flex justify-center items-center h-48" role="status" aria-label="Loading listings">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
                </div>
              ) : discover.error ? (
                <div className="flex justify-center items-center h-48" role="alert">
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-6 py-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-3">
                    <span>Couldn't load games.</span>
                    <button type="button" onClick={discover.refetch} className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold hover:underline">Retry</button>
                  </div>
                </div>
              ) : discover.channels.length === 0 ? (
                <div className="p-6 text-center text-surface-500 dark:text-surface-400 text-sm">
                  No games listed yet.
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-surface-200 dark:divide-surface-700">
                    {discover.channels.map((channel) => {
                      const memberCount = channel.member_count ?? 0
                      const activity = channelTimestamp(channel.last_message_at)
                      return (
                        <li key={channel.id}>
                          <button
                            type="button"
                            data-testid="discover-card"
                            onClick={() => setSelectedListing({ id: channel.id, gameSystem: channel.game_system ?? null })}
                            className="block w-full text-left hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                          >
                            <div className="flex items-start px-3 py-3 sm:px-6 gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-500 dark:text-primary-400 flex-shrink-0">
                                {(channel.name[0] || '#').toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-base font-medium text-primary-600 dark:text-primary-400 truncate">
                                    {channel.name}
                                  </span>
                                  <span className="flex-shrink-0 text-xs text-surface-400 dark:text-surface-400 truncate">
                                    GM {channel.gm_display_name ?? 'unknown'}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-sm text-surface-500 dark:text-surface-400 line-clamp-2">
                                  {channel.description}
                                </p>
                                <p className="mt-0.5 text-xs text-surface-400 dark:text-surface-400">
                                  {gameSystemLabel(channel.game_system)} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
                                  {activity ? ` · ${activity}` : ''}
                                </p>
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  {discover.hasMore && (
                    <div className="px-3 py-3 sm:px-6 border-t border-surface-200 dark:border-surface-700">
                      <button
                        type="button"
                        onClick={() => void discover.loadMore()}
                        disabled={discover.loadingMore}
                        className="w-full inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 shadow-sm px-4 py-2 bg-white dark:bg-surface-800 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                      >
                        {discover.loadingMore ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
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

      {selectedListing && (
        <PublicChannelDetailSheet
          channelId={selectedListing.id}
          gameSystem={selectedListing.gameSystem}
          onClose={() => setSelectedListing(null)}
        />
      )}
    </div>
  )
}
