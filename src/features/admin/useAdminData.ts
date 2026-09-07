import { useEffect, useState } from 'react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import type { Json } from '../../types/database'

export const AdminUserRowSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
  channel_count: z.number(),
  created_at: z.string(),
  is_suspended: z.boolean(),
})

export const AdminChannelRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  game_system: z.string(),
  gm_id: z.string().nullable(),
  member_count: z.number(),
  created_at: z.string(),
  last_message_at: z.string().nullable(),
  gm_display_name: z.string().nullable(),
})

export type AdminUser = z.infer<typeof AdminUserRowSchema>
export type AdminChannel = z.infer<typeof AdminChannelRowSchema>

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
        // RPC payloads aren't runtime-validated; malformed data would crash
        // AdminView's useSort during render, so treat it as a load error
        // instead of trusting the cast.
        if (!Array.isArray(userData) || !Array.isArray(channelData)) {
          throw new Error('Malformed admin data payload.')
        }
        if (mounted) {
          setUsers(
            userData
              .map(u => AdminUserRowSchema.safeParse(u))
              .filter(r => r.success)
              .map(r => r.data)
          )
          setChannels(
            channelData
              .map(c => AdminChannelRowSchema.safeParse(c))
              .filter(r => r.success)
              .map(r => r.data)
          )
          setStorageBytes(typeof storageData === 'number' ? storageData : 0)
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
  // A rejected RPC promise must flow through the same error contract as a
  // resolved-with-error response, otherwise the caller's toast never runs.
  const suspendUser = async (userId: string, suspend: boolean, reason: string) => {
    let rpcError: { message: string } | null = null
    try {
      rpcError = (await supabase.rpc('admin_suspend_user', {
        p_user_id: userId,
        p_suspend: suspend,
        p_reason: reason
      })).error
    } catch (err) {
      rpcError = err as { message: string }
    }
    if (rpcError) return rpcError
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, is_suspended: suspend } : u
    ))
    return null
  }

  // Claims an orphaned channel for the current admin; list updated in place.
  const claimChannel = async (channelId: string) => {
    let rpcError: { message: string } | null = null
    try {
      rpcError = (await supabase.rpc('admin_claim_channel', { p_channel_id: channelId })).error
    } catch (err) {
      rpcError = err as { message: string }
    }
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
