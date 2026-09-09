import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { useAppSetting } from '../../hooks/useAppSetting'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useAdminData, type AdminUser } from './useAdminData'
import { UserDetailModal } from './UserDetailModal'

type Tab = 'users' | 'channels' | 'settings'
type SortDir = 'asc' | 'desc'
type UserFilter = 'all' | 'active' | 'inactive' | 'suspended'

const INACTIVE_DAYS = 30

function useSort<T>(data: T[], initialKey: keyof T, initialDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<keyof T>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  const handleSort = (key: keyof T) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    let cmp = 0
    if (av === null || av === undefined) cmp = 1
    else if (bv === null || bv === undefined) cmp = -1
    else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  return { sorted, sortKey, sortDir, handleSort }
}

function SortHeader<T>({ label, sortKey, activeKey, sortDir, onSort }: {
  label: string
  sortKey: keyof T
  activeKey: keyof T
  sortDir: SortDir
  onSort: (key: keyof T) => void
}) {
  const isActive = activeKey === sortKey
  return (
    <th
      className="text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider"
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="w-full px-6 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
      >
        {label} {isActive ? (sortDir === 'asc' ? '▲' : '▼') : ''}
      </button>
    </th>
  )
}

// A user is Inactive when they never signed in or their last login predates the
// cutoff. Suspended takes precedence; anything else is Active.
function userStatus(u: AdminUser): Exclude<UserFilter, 'all'> {
  if (u.is_suspended) return 'suspended'
  const lastLogin = u.last_login_at ? new Date(u.last_login_at).getTime() : 0
  if (!lastLogin || Date.now() - lastLogin > INACTIVE_DAYS * 24 * 60 * 60 * 1000) return 'inactive'
  return 'active'
}

export function AdminView() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [tab, setTab] = useState<Tab>('users')
  const [channelLimit, setChannelLimit] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { value: maxChannels, loading: settingsLoading } = useAppSetting<number>('max_channels_per_user', 10)
  const { value: imageUploadingEnabled, loading: imageSettingsLoading } = useAppSetting<boolean>('image_uploading_enabled', false)
  const { value: imageMaxSizeMb } = useAppSetting<number>('image_max_size_mb', 5)
  const { value: imageRetentionDays } = useAppSetting<number>('image_retention_days', 0)
  const [imageUploadEnabled, setImageUploadEnabled] = useState(false)
  const [imageMaxSize, setImageMaxSize] = useState('5')
  const [imageRetention, setImageRetention] = useState('0')
  const [isSavingImages, setIsSavingImages] = useState(false)
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<UserFilter>('all')

  const { isServerAdmin, loading: adminLoading } = useIsServerAdmin()

  const { users, channels, storageBytes, loading, error, suspendUser, claimChannel, upsertSettings, getUserHistory } = useAdminData(isServerAdmin)

  const userSort = useSort(users, 'display_name')
  const channelSort = useSort(channels, 'name')

  useEffect(() => {
    if (adminLoading) return
    if (!isServerAdmin) {
      navigate('/', { replace: true })
      return
    }
    setChannelLimit(String(maxChannels))
    setImageUploadEnabled(Boolean(imageUploadingEnabled))
    setImageMaxSize(String(imageMaxSizeMb))
    setImageRetention(String(imageRetentionDays))
  }, [isServerAdmin, adminLoading, maxChannels, imageUploadingEnabled, imageMaxSizeMb, imageRetentionDays, navigate])

  if (adminLoading) return null
  if (!isServerAdmin) return null

  const handleSaveLimit = async () => {
    const value = Number(channelLimit)
    if (!Number.isInteger(value) || value < 10) {
      addToast('Maximum channels per user must be at least 10.', 'error')
      return
    }
    setIsSaving(true)
    try {
      const upsertError = await upsertSettings([{ key: 'max_channels_per_user', value }])
      if (upsertError) throw upsertError
      addToast('Channel limit updated. Existing members are kept in their channels.', 'success')
    } catch (err) {
      console.error('Error saving channel limit:', err)
      addToast('Failed to update channel limit.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveImageSettings = async () => {
    const mb = Number(imageMaxSize)
    if (!Number.isInteger(mb) || mb < 1 || mb > 50) {
      addToast('Maximum image size must be between 1 and 50 MB.', 'error')
      return
    }
    const retention = Number(imageRetention)
    if (!Number.isInteger(retention) || retention < 0 || retention > 365) {
      addToast('Image retention must be between 0 and 365 days.', 'error')
      return
    }
    setIsSavingImages(true)
    try {
      const upsertError = await upsertSettings([
        { key: 'image_uploading_enabled', value: imageUploadEnabled },
        { key: 'image_max_size_mb', value: mb },
        { key: 'image_retention_days', value: retention },
      ])
      if (upsertError) throw upsertError
      addToast('Image upload settings updated.', 'success')
    } catch (err) {
      console.error('Error saving image settings:', err)
      addToast('Failed to update image upload settings.', 'error')
    } finally {
      setIsSavingImages(false)
    }
  }

  const handleSuspend = async (targetUser: AdminUser, reason: string): Promise<boolean> => {
    const action = targetUser.is_suspended ? 'Unsuspend' : 'Suspend'
    const rpcError = await suspendUser(targetUser.id, !targetUser.is_suspended, reason || 'No reason provided')
    if (rpcError) {
      console.error(`Error ${action.toLowerCase()}ing user:`, rpcError)
      addToast(`Failed to ${action.toLowerCase()} user.`, 'error')
      return false
    }
    addToast(`User ${action.toLowerCase()}ed successfully.`, 'success')
    setDetailUser(prev => (prev && prev.id === targetUser.id ? { ...prev, is_suspended: !prev.is_suspended } : prev))
    return true
  }

  const handleClaimChannel = async (channelId: string) => {
    const rpcError = await claimChannel(channelId)
    if (rpcError) {
      console.error('Error claiming channel:', rpcError)
      addToast('Failed to claim channel.', 'error')
      return
    }
    addToast('Channel claimed. You are now the GM.', 'success')
  }

  // Copy the opted-in email list (newline-joined) onto the clipboard. Mirrors
  // ChannelSettings' invite-link copy: navigator.clipboard in secure
  // contexts, execCommand fallback otherwise.
  const handleCopyOptedInEmails = async () => {
    const text = optedInEmails.map(email => email.replace(/[\r\n]+/g, '')).join('\n')
    if (!text) return
    let textArea: HTMLTextAreaElement | null = null
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'absolute'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        // ponytail: legacy fallback for non-secure contexts, navigator.clipboard covers all modern browsers
        const success = document.execCommand('copy')
        if (!success) {
          throw new Error('execCommand returned false')
        }
      }
      addToast(`Copied ${optedInEmails.length} opted-in emails.`, 'success')
    } catch (err) {
      console.error('Failed to copy opted-in emails:', err)
      addToast('Failed to copy opted-in emails.', 'error')
    } finally {
      if (textArea?.isConnected) {
        document.body.removeChild(textArea)
      }
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'channels', label: 'Channels' },
    { id: 'settings', label: 'Settings' },
  ]

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const newUsers = users.filter(u => new Date(u.created_at).getTime() > sevenDaysAgo).length
  const newChannels = channels.filter(c => new Date(c.created_at).getTime() > sevenDaysAgo).length

  // Opt-in email export (#466): copy each consenting user's address onto the
  // clipboard for bulk sending. Only users with both an opt-in flag AND an
  // address qualify.
  const optedInEmails = users
    .filter(u => u.email_opt_in && u.email)
    .map(u => u.email as string)
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const query = search.trim().toLowerCase()
  const filteredUsers = userSort.sorted.filter(u => {
    if (filter !== 'all' && userStatus(u) !== filter) return false
    if (!query) return true
    return (
      (u.display_name?.toLowerCase().includes(query) ?? false) ||
      (u.email?.toLowerCase().includes(query) ?? false)
    )
  })

  const filterOptions: { id: UserFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
    { id: 'suspended', label: 'Suspended' },
  ]

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">Server Admin</h2>

      {!loading && !settingsLoading && !imageSettingsLoading && !error && (
        <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="overflow-hidden rounded-lg bg-white dark:bg-surface-800 shadow px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-surface-500 dark:text-surface-400">Total Users</dt>
            <dd className="mt-1 flex items-baseline justify-between md:block lg:flex">
              <div className="flex items-baseline text-2xl font-semibold text-surface-900 dark:text-surface-100">
                {users.length}
              </div>
              <div className="inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 md:mt-2 lg:mt-0">
                +{newUsers} this week
              </div>
            </dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white dark:bg-surface-800 shadow px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-surface-500 dark:text-surface-400">Total Channels</dt>
            <dd className="mt-1 flex items-baseline justify-between md:block lg:flex">
              <div className="flex items-baseline text-2xl font-semibold text-surface-900 dark:text-surface-100">
                {channels.length}
              </div>
              <div className="inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 md:mt-2 lg:mt-0">
                +{newChannels} this week
              </div>
            </dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white dark:bg-surface-800 shadow px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-surface-500 dark:text-surface-400">Image Storage</dt>
            <dd className="mt-1 flex items-baseline justify-between md:block lg:flex">
              <div className="flex items-baseline text-2xl font-semibold text-surface-900 dark:text-surface-100">
                {formatBytes(storageBytes)}
              </div>
              <div className="inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-medium bg-surface-100 text-surface-800 dark:bg-surface-700 dark:text-surface-300 md:mt-2 lg:mt-0">
                public bucket
              </div>
            </dd>
          </div>
        </div>
      )}

      <div className="mb-6 border-b border-surface-200 dark:border-surface-700">
        <nav className="-mb-px flex space-x-6" aria-label="Admin sections">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300 dark:text-surface-400 dark:hover:text-surface-300 dark:hover:border-surface-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {loading || settingsLoading || imageSettingsLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
        </div>
      ) : (
        <>
          {tab === 'users' && (
            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <label htmlFor="user-search" className="sr-only">Search users</label>
                <input
                  id="user-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full sm:w-72 bg-white dark:bg-surface-800 rounded-md border-surface-300 dark:border-surface-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3 py-2 border"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1" role="group" aria-label="Filter users by status">
                  {filterOptions.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      aria-pressed={filter === f.id}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        filter === f.id
                          ? 'bg-primary-600 text-white'
                          : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyOptedInEmails}
                    disabled={optedInEmails.length === 0}
                    title={optedInEmails.length === 0
                      ? 'No users have opted in to email updates yet.'
                      : 'Copy the email addresses of users who opted in, one per line.'}
                    aria-label="Copy opted-in emails"
                    className="inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 py-1.5 px-3 text-sm font-medium text-surface-700 dark:text-surface-300 shadow-sm hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Copy opted-in emails
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-surface-800 shadow overflow-hidden rounded-md">
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-surface-500 dark:text-surface-400 text-sm">
                    {users.length === 0 ? 'No users found.' : 'No users match your search.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-surface-200 dark:divide-surface-700">
                      <thead className="bg-surface-50 dark:bg-surface-900">
                        <tr>
                          <SortHeader label="Name" sortKey="display_name" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                          <SortHeader label="Channels" sortKey="channel_count" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                          <SortHeader label="Joined" sortKey="created_at" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-surface-800 divide-y divide-surface-200 dark:divide-surface-700">
                        {filteredUsers.map(user => (
                          <tr
                            key={user.id}
                            className={`${user.is_suspended ? "opacity-75 bg-red-50 dark:bg-red-900/10" : "hover:bg-surface-50 dark:hover:bg-surface-700/40"}`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-900 dark:text-surface-100">
                              <button
                                type="button"
                                onClick={() => setDetailUser(user)}
                                className="inline-flex items-center gap-2 text-left hover:underline focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 rounded cursor-pointer"
                              >
                                <span>{user.display_name || user.email || 'Unknown'}</span>
                                {user.is_suspended && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                                    Suspended
                                  </span>
                                )}
                                {user.server_admin && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200">
                                    Admin
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">{user.channel_count}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">
                              {new Date(user.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'channels' && (
            <div className="bg-white dark:bg-surface-800 shadow overflow-hidden rounded-md">
              {channelSort.sorted.length === 0 ? (
                <div className="p-6 text-center text-surface-500 dark:text-surface-400 text-sm">No channels found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-surface-200 dark:divide-surface-700">
                    <thead className="bg-surface-50 dark:bg-surface-900">
                      <tr>
                        <SortHeader label="Name" sortKey="name" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="System" sortKey="game_system" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="GM" sortKey="gm_display_name" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Members" sortKey="member_count" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Created" sortKey="created_at" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Last Active" sortKey="last_message_at" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-surface-800 divide-y divide-surface-200 dark:divide-surface-700">
                      {channelSort.sorted.map(channel => (
                        <tr key={channel.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-900 dark:text-surface-100">{channel.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">{channel.game_system || 'none'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">
                            {channel.gm_id === null ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                                  Orphaned
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleClaimChannel(channel.id)}
                                  className="inline-flex items-center px-2 py-1 border border-surface-300 dark:border-surface-600 shadow-sm text-xs font-medium rounded-md text-surface-700 dark:text-surface-300 bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                                >
                                  Claim
                                </button>
                              </span>
                            ) : (
                              channel.gm_display_name || '—'
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">{channel.member_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">
                            {new Date(channel.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500 dark:text-surface-400">
                            {channel.last_message_at ? new Date(channel.last_message_at).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="max-w-md bg-white dark:bg-surface-800 shadow rounded-md p-6">
              <label htmlFor="maxChannels" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                Maximum Channels per user
              </label>
              <input
                type="number"
                id="maxChannels"
                min={10}
                value={channelLimit}
                onChange={(e) => setChannelLimit(e.target.value)}
                className="bg-white dark:bg-surface-800 mt-1 block w-full rounded-md border-surface-300 dark:border-surface-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3 py-2 border"
              />
              <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
                Cannot be less than 10. Users already over the limit keep their existing channels.
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveLimit}
                  disabled={isSaving}
                  className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-surface-200 dark:border-surface-700">
                <h3 className="text-sm font-medium text-surface-900 dark:text-surface-100">Image Uploads</h3>
                <div className="mt-3">
                  <label htmlFor="imageUploadEnabled" className="flex items-center justify-between gap-4">
                    <span className="text-sm text-surface-700 dark:text-surface-300">Allow image uploads (channel avatars)</span>
                    <input
                      type="checkbox"
                      id="imageUploadEnabled"
                      checked={imageUploadEnabled}
                      onChange={(e) => setImageUploadEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 dark:text-primary-400 focus:ring-primary-500"
                    />
                  </label>
                  <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                    Off by default to keep the server at near-zero cost. Uploads are resized client-side and capped by the max size below.
                  </p>
                </div>
                <div className="mt-4">
                  <label htmlFor="imageMaxSize" className="block text-sm font-medium text-surface-700 dark:text-surface-300">Maximum image size (MB)</label>
                  <input
                    type="number"
                    id="imageMaxSize"
                    min={1}
                    max={50}
                    value={imageMaxSize}
                    onChange={(e) => setImageMaxSize(e.target.value)}
                    className="bg-white dark:bg-surface-800 mt-1 block w-full rounded-md border-surface-300 dark:border-surface-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3 py-2 border"
                  />
                  <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">Between 1 and 50 MB.</p>
                </div>
                <div className="mt-4">
                  <label htmlFor="imageRetention" className="block text-sm font-medium text-surface-700 dark:text-surface-300">Auto-delete images older than (days)</label>
                  <input
                    type="number"
                    id="imageRetention"
                    min={0}
                    max={365}
                    value={imageRetention}
                    onChange={(e) => setImageRetention(e.target.value)}
                    className="bg-white dark:bg-surface-800 mt-1 block w-full rounded-md border-surface-300 dark:border-surface-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3 py-2 border"
                  />
                  <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">0 keeps images forever. A daily cleanup function deletes older images.</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveImageSettings}
                    disabled={isSavingImages}
                    className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {isSavingImages ? 'Saving...' : 'Save Image Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {detailUser && (
        <UserDetailModal
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onSuspend={handleSuspend}
          getUserHistory={getUserHistory}
        />
      )}
    </div>
  )
}
