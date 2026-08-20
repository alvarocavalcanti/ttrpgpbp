import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { useAppSetting } from '../../hooks/useAppSetting'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useAuth } from '../auth/useAuth'

type AdminUser = {
  id: string
  display_name: string | null
  email: string | null
  channel_count: number
  created_at: string
}

type AdminChannel = {
  id: string
  name: string
  game_system: string
  gm_id: string | null
  member_count: number
  created_at: string
  last_message_at: string | null
  gm_display_name: string | null
}

type Tab = 'users' | 'channels' | 'settings'

type SortDir = 'asc' | 'desc'

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
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300"
      onClick={() => onSort(sortKey)}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label} {isActive ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  )
}

export function AdminView() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [channels, setChannels] = useState<AdminChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channelLimit, setChannelLimit] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { value: maxChannels, loading: settingsLoading } = useAppSetting<number>('max_channels_per_user', 10)
  const { value: imageUploadingEnabled, loading: imageSettingsLoading } = useAppSetting<boolean>('image_uploading_enabled', false)
  const { value: imageMaxSizeMb } = useAppSetting<number>('image_max_size_mb', 5)
  const { value: imageRetentionDays } = useAppSetting<number>('image_retention_days', 0)
  const { value: recurringReportFreq } = useAppSetting<string>('recurring_report_frequency', 'off')
  const [imageUploadEnabled, setImageUploadEnabled] = useState(false)
  const [imageMaxSize, setImageMaxSize] = useState('5')
  const [imageRetention, setImageRetention] = useState('0')
  const [reportFreq, setReportFreq] = useState('off')
  const [isSavingImages, setIsSavingImages] = useState(false)
  const [isSavingReport, setIsSavingReport] = useState(false)

  const { isServerAdmin, loading: adminLoading } = useIsServerAdmin()

  const userSort = useSort(users, 'display_name')
  const channelSort = useSort(channels, 'name')

  useEffect(() => {
    if (adminLoading) return
    if (!isServerAdmin) {
      navigate('/')
      return
    }
    setChannelLimit(String(maxChannels))
    setImageUploadEnabled(Boolean(imageUploadingEnabled))
    setImageMaxSize(String(imageMaxSizeMb))
    setImageRetention(String(imageRetentionDays))
    setReportFreq(recurringReportFreq)
  }, [isServerAdmin, adminLoading, maxChannels, imageUploadingEnabled, imageMaxSizeMb, imageRetentionDays, recurringReportFreq, navigate])

  useEffect(() => {
    if (!isServerAdmin) return
    let mounted = true

    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const [{ data: userData, error: userError }, { data: channelData, error: channelError }] = await Promise.all([
          supabase.rpc('admin_list_users'),
          supabase.rpc('admin_list_channels'),
        ])
        if (userError) throw userError
        if (channelError) throw channelError
        if (mounted) {
          setUsers((userData as AdminUser[]) || [])
          setChannels((channelData as AdminChannel[]) || [])
        }
      } catch (err) {
        console.error('Error fetching admin data:', err)
        if (mounted) setError('Failed to load admin data.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchData()
    return () => { mounted = false }
  }, [isServerAdmin])

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
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'max_channels_per_user', value }, { onConflict: 'key' })
      if (error) throw error
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
      const { error } = await supabase
        .from('app_settings')
        .upsert([
          { key: 'image_uploading_enabled', value: imageUploadEnabled },
          { key: 'image_max_size_mb', value: mb },
          { key: 'image_retention_days', value: retention },
        ], { onConflict: 'key' })
      if (error) throw error
      addToast('Image upload settings updated.', 'success')
    } catch (err) {
      console.error('Error saving image settings:', err)
      addToast('Failed to update image upload settings.', 'error')
    } finally {
      setIsSavingImages(false)
    }
  }

  const handleSaveReportSettings = async () => {
    setIsSavingReport(true)
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert([{ key: 'recurring_report_frequency', value: `"${reportFreq}"` }], { onConflict: 'key' })
      if (error) throw error
      addToast('Report settings updated.', 'success')
    } catch (err) {
      console.error('Error saving report settings:', err)
      addToast('Failed to update report settings.', 'error')
    } finally {
      setIsSavingReport(false)
    }
  }

  const handleClaimChannel = async (channelId: string) => {
    try {
      const { error } = await supabase.rpc('admin_claim_channel', { p_channel_id: channelId })
      if (error) throw error
      setChannels(prev => prev.map(c =>
        c.id === channelId ? { ...c, gm_id: user?.id ?? null, gm_display_name: profile?.display_name ?? 'You' } : c
      ))
      addToast('Channel claimed. You are now the GM.', 'success')
    } catch (err) {
      console.error('Error claiming channel:', err)
      addToast('Failed to claim channel.', 'error')
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'channels', label: 'Channels' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Server Admin</h2>

      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-6" aria-label="Admin sections">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
        </div>
      ) : (
        <>
          {tab === 'users' && (
            <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-md">
              {userSort.sorted.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">No users found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <SortHeader label="Name" sortKey="display_name" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                        <SortHeader label="Channels" sortKey="channel_count" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                        <SortHeader label="Joined" sortKey="created_at" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {userSort.sorted.map(user => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {user.display_name || user.email || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.channel_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {new Date(user.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'channels' && (
            <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-md">
              {channelSort.sorted.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">No channels found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <SortHeader label="Name" sortKey="name" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="System" sortKey="game_system" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="GM" sortKey="gm_display_name" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Members" sortKey="member_count" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Created" sortKey="created_at" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Last Active" sortKey="last_message_at" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {channelSort.sorted.map(channel => (
                        <tr key={channel.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{channel.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{channel.game_system || 'none'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {channel.gm_id === null ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                                  Orphaned
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleClaimChannel(channel.id)}
                                  className="inline-flex items-center px-2 py-1 border border-gray-300 dark:border-gray-600 shadow-sm text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                >
                                  Claim
                                </button>
                              </span>
                            ) : (
                              channel.gm_display_name || '—'
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{channel.member_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {new Date(channel.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
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
            <div className="max-w-md bg-white dark:bg-gray-800 shadow rounded-md p-6">
              <label htmlFor="maxChannels" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Maximum Channels per user
              </label>
              <input
                type="number"
                id="maxChannels"
                min={10}
                value={channelLimit}
                onChange={(e) => setChannelLimit(e.target.value)}
                className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Cannot be less than 10. Users already over the limit keep their existing channels.
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveLimit}
                  disabled={isSaving}
                  className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Image Uploads</h3>
                <div className="mt-3">
                  <label htmlFor="imageUploadEnabled" className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Allow image uploads (channel avatars)</span>
                    <input
                      type="checkbox"
                      id="imageUploadEnabled"
                      checked={imageUploadEnabled}
                      onChange={(e) => setImageUploadEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Off by default to keep the server at near-zero cost. Uploads are resized client-side and capped by the max size below.
                  </p>
                </div>
                <div className="mt-4">
                  <label htmlFor="imageMaxSize" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Maximum image size (MB)</label>
                  <input
                    type="number"
                    id="imageMaxSize"
                    min={1}
                    max={50}
                    value={imageMaxSize}
                    onChange={(e) => setImageMaxSize(e.target.value)}
                    className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Between 1 and 50 MB.</p>
                </div>
                <div className="mt-4">
                  <label htmlFor="imageRetention" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Auto-delete images older than (days)</label>
                  <input
                    type="number"
                    id="imageRetention"
                    min={0}
                    max={365}
                    value={imageRetention}
                    onChange={(e) => setImageRetention(e.target.value)}
                    className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">0 keeps images forever. A daily cleanup function deletes older images.</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveImageSettings}
                    disabled={isSavingImages}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {isSavingImages ? 'Saving...' : 'Save Image Settings'}
                  </button>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Recurring Reports</h3>
                <div className="mt-3">
                  <label htmlFor="reportFreq" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Send report via email
                  </label>
                  <select
                    id="reportFreq"
                    value={reportFreq}
                    onChange={(e) => setReportFreq(e.target.value)}
                    className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                  >
                    <option value="off">Off</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Emails are sent to all server admins via Resend. Ensure RESEND_API_KEY is configured.
                  </p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveReportSettings}
                    disabled={isSavingReport}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {isSavingReport ? 'Saving...' : 'Save Report Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
