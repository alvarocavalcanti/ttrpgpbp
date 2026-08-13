import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { useAppSetting } from '../../hooks/useAppSetting'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'

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
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      onClick={() => onSort(sortKey)}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label} {isActive ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  )
}

export function AdminView() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [channels, setChannels] = useState<AdminChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channelLimit, setChannelLimit] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { value: maxChannels, loading: settingsLoading } = useAppSetting<number>('max_channels_per_user', 10)

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
  }, [isServerAdmin, adminLoading, maxChannels, navigate])

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'channels', label: 'Channels' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Server Admin</h2>

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Admin sections">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
          {error}
        </div>
      )}

      {loading || settingsLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {tab === 'users' && (
            <div className="bg-white shadow overflow-hidden rounded-md">
              {userSort.sorted.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No users found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <SortHeader label="Name" sortKey="display_name" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                        <SortHeader label="Channels" sortKey="channel_count" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                        <SortHeader label="Joined" sortKey="created_at" activeKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.handleSort} />
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {userSort.sorted.map(user => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.display_name || user.email || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.channel_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
            <div className="bg-white shadow overflow-hidden rounded-md">
              {channelSort.sorted.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No channels found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <SortHeader label="Name" sortKey="name" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="System" sortKey="game_system" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Members" sortKey="member_count" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Created" sortKey="created_at" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                        <SortHeader label="Last Active" sortKey="last_message_at" activeKey={channelSort.sortKey} sortDir={channelSort.sortDir} onSort={channelSort.handleSort} />
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {channelSort.sorted.map(channel => (
                        <tr key={channel.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{channel.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{channel.game_system || 'none'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{channel.member_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(channel.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
            <div className="max-w-md bg-white shadow rounded-md p-6">
              <label htmlFor="maxChannels" className="block text-sm font-medium text-gray-700">
                Maximum Channels per user
              </label>
              <input
                type="number"
                id="maxChannels"
                min={10}
                value={channelLimit}
                onChange={(e) => setChannelLimit(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              />
              <p className="mt-2 text-xs text-gray-500">
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
            </div>
          )}
        </>
      )}
    </div>
  )
}
