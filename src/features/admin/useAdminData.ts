import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import type { Json } from '../../types/database'

export type AdminUser = {
  id: string
  display_name: string | null
  email: string | null
  channel_count: number
  created_at: string
  is_suspended: boolean
}

export type AdminChannel = {
  id: string
  name: string
  game_system: string
  gm_id: string | null
  member_count: number
  created_at: string
  last_message_at: string | null
  gm_display_name: string | null
}

// Data layer for the server admin console (ARCH-1): the admin_list_* queries,
// suspend/claim RPCs, and app_settings upserts live here; AdminView keeps the
// tabs, sorting, and toast UX.
export function useAdminData(isServerAdmin: boolean) {
  const { user, profile } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [channels, setChannels] = useState<AdminChannel[]>([])
  const [storageBytes, setStorageBytes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isServerAdmin) return
    let mounted = true

    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const [
          { data: userData, error: userError },
          { data: channelData, error: channelError },
          { data: storageData, error: storageError }
        ] = await Promise.all([
          supabase.rpc('admin_list_users'),
          supabase.rpc('admin_list_channels'),
          supabase.rpc('admin_get_image_storage_bytes'),
        ])
        if (userError) throw userError
        if (channelError) throw channelError
        if (storageError) throw storageError
        if (mounted) {
          setUsers((userData as AdminUser[]) || [])
          setChannels((channelData as AdminChannel[]) || [])
          setStorageBytes(storageData || 0)
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

  // Suspends/un-suspends a user; on success the list is updated in place.
  const suspendUser = async (userId: string, suspend: boolean, reason: string) => {
    const { error: rpcError } = await supabase.rpc('admin_suspend_user', {
      p_user_id: userId,
      p_suspend: suspend,
      p_reason: reason
    })
    if (rpcError) return rpcError
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, is_suspended: suspend } : u
    ))
    return null
  }

  // Claims an orphaned channel for the current admin; list updated in place.
  const claimChannel = async (channelId: string) => {
    const { error: rpcError } = await supabase.rpc('admin_claim_channel', { p_channel_id: channelId })
    if (rpcError) return rpcError
    setChannels(prev => prev.map(c =>
      c.id === channelId ? { ...c, gm_id: user?.id ?? null, gm_display_name: profile?.display_name ?? 'You' } : c
    ))
    return null
  }

  const upsertSettings = async (entries: { key: string; value: Json }[]) => {
    const { error: upsertError } = await supabase
      .from('app_settings')
      .upsert(entries, { onConflict: 'key' })
    return upsertError
  }

  return { users, channels, storageBytes, loading, error, suspendUser, claimChannel, upsertSettings }
}
