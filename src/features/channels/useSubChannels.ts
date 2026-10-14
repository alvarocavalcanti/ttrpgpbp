import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { subscribeWithRetry } from '../../lib/realtime'
import { toError } from '../../lib/errors'
import { SubChannelRowSchema, parseRow } from '../validation/rowSchemas'

export type SubChannel = Database['public']['Tables']['sub_channels']['Row']

// Rooms (sub-channels) of one channel. Reads are membership-gated by RLS; every
// write is GM-only and server-owned (create/update/delete_sub_channel), so the
// hook never writes state optimistically — it relies on the realtime echo, so a
// GM and a player converge on the same list.
export function useSubChannels(channelId: string | undefined) {
  const { user } = useAuth()
  const [rooms, setRooms] = useState<SubChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), [])

  useEffect(() => {
    let mounted = true
    // Drop a previous channel's rooms on route change (this hook stays mounted).
    setRooms([])
    setError(null)
    setLoading(true)

    if (!channelId || !user?.id) {
      setLoading(false)
      return
    }

    async function fetchRooms() {
      try {
        const { data, error } = await supabase
          .from('sub_channels')
          .select('*')
          .eq('channel_id', channelId as string)
          .order('created_at', { ascending: true })
        if (error) throw error
        // One malformed row drops; the rest of the strip stays usable.
        const parsed = (data ?? []).flatMap(row => {
          const room = parseRow(SubChannelRowSchema, row)
          return room ? [room as SubChannel] : []
        })
        if (mounted) setRooms(parsed)
      } catch (err) {
        console.error('Error fetching rooms:', err)
        if (mounted) setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchRooms()

    let firstSubscribe = true
    const realtimeChannel = supabase
      .channel(`channel:${channelId}:rooms`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sub_channels', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (!mounted) return
          if (payload.eventType === 'INSERT') {
            const next = parseRow(SubChannelRowSchema, payload.new)
            if (next) {
              setRooms(prev =>
                [...prev, next as SubChannel].sort(
                  (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''),
                ),
              )
            }
          } else if (payload.eventType === 'UPDATE') {
            const next = parseRow(SubChannelRowSchema, payload.new)
            if (next) setRooms(prev => prev.map(r => (r.id === next.id ? ({ ...r, ...next } as SubChannel) : r)))
          } else if (payload.eventType === 'DELETE') {
            // Replica identity is FULL, so the echo carries channel_id too.
            const oldId = (payload.old as { id?: string } | null)?.id
            if (oldId) setRooms(prev => prev.filter(r => r.id !== oldId))
          }
        },
      )
    const stopRealtime = subscribeWithRetry(realtimeChannel, `channel:${channelId}:rooms`, (status) => {
      if (mounted && status === 'SUBSCRIBED') {
        if (firstSubscribe) firstSubscribe = false
        else void fetchRooms()
      }
    })

    return () => {
      mounted = false
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId, user?.id, refetchTrigger])

  const create = useCallback(
    async (name: string) => {
      if (!channelId) throw new Error('No channel.')
      const { data, error } = await supabase.rpc('create_sub_channel', {
        p_channel_id: channelId,
        p_name: name,
      })
      if (error) throw error
      return data as string
    },
    [channelId],
  )

  const rename = useCallback(async (roomId: string, name: string) => {
    const { error } = await supabase.rpc('update_sub_channel', { p_sub_channel_id: roomId, p_name: name })
    if (error) throw error
  }, [])

  const setArchived = useCallback(async (roomId: string, isArchived: boolean) => {
    const { error } = await supabase.rpc('update_sub_channel', {
      p_sub_channel_id: roomId,
      p_is_archived: isArchived,
    })
    if (error) throw error
  }, [])

  const remove = useCallback(async (roomId: string) => {
    const { error } = await supabase.rpc('delete_sub_channel', { p_sub_channel_id: roomId })
    if (error) throw error
  }, [])

  const subChannels = rooms.filter(r => !r.is_archived)
  const archivedRooms = rooms.filter(r => r.is_archived)

  return { subChannels, archivedRooms, loading, error, create, rename, setArchived, remove, refetch }
}
