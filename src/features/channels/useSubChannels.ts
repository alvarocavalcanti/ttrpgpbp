import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { subscribeWithRetry } from '../../lib/realtime'
import { toError } from '../../lib/errors'
import { SubChannelRowSchema, parseRow } from '../validation/rowSchemas'

export type SubChannel = Database['public']['Tables']['sub_channels']['Row']

export type RoomVisibility = 'all' | 'gm' | 'private'

// Per-room capability flags (#621 Phase 2). All default true.
export interface RoomCapabilities {
  allow_dice: boolean
  allow_scenes: boolean
  allow_npc: boolean
  allow_whispers: boolean
}

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

  // Invited user ids per private room (#621 Phase 3).
  const [roomMembers, setRoomMembers] = useState<Record<string, string[]>>({})

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

        // Invited members per room (only meaningful for 'private').
        const ids = parsed.map(r => r.id)
        if (ids.length === 0) {
          if (mounted) setRoomMembers({})
          return
        }
        const { data: memberRows, error: memberError } = await supabase
          .from('sub_channel_members')
          .select('sub_channel_id, user_id')
          .in('sub_channel_id', ids)
        if (memberError) throw memberError
        const byRoom: Record<string, string[]> = {}
        for (const m of memberRows ?? []) {
          ;(byRoom[m.sub_channel_id] ??= []).push(m.user_id)
        }
        if (mounted) setRoomMembers(byRoom)
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
              setRooms(prev => {
                // Merge, don't blind-append: a realtime INSERT racing the
                // initial/reconnect fetch must not create a duplicate tab.
                if (prev.some(r => r.id === next.id)) {
                  return prev.map(r => (r.id === next.id ? ({ ...r, ...next } as SubChannel) : r))
                }
                return [...prev, next as SubChannel].sort(
                  (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''),
                )
              })
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

  // Per-room capability flags (#621 Phase 2). A PARTIAL update: only the
  // supplied flags are sent and update_sub_channel COALESCEs the rest, so a
  // rapid second toggle cannot clobber the first with a stale snapshot (the
  // realtime echo has not landed yet).
  const setCapabilities = useCallback(async (roomId: string, caps: Partial<RoomCapabilities>) => {
    const { error } = await supabase.rpc('update_sub_channel', {
      p_sub_channel_id: roomId,
      p_allow_dice: caps.allow_dice,
      p_allow_scenes: caps.allow_scenes,
      p_allow_npc: caps.allow_npc,
      p_allow_whispers: caps.allow_whispers,
    })
    if (error) throw error
  }, [])

  // Per-room audience (#621 Phase 3). Partial updates only — visibility, or a
  // single member toggle — so rapid clicks cannot clobber each other.
  const setVisibility = useCallback(async (roomId: string, visibility: RoomVisibility) => {
    const { error } = await supabase.rpc('set_sub_channel_visibility', {
      p_sub_channel_id: roomId,
      p_visibility: visibility,
    })
    if (error) throw error
    if (visibility !== 'private') setRoomMembers(prev => ({ ...prev, [roomId]: [] }))
  }, [])

  const addMember = useCallback(async (roomId: string, userId: string) => {
    const { error } = await supabase.rpc('add_sub_channel_member', {
      p_sub_channel_id: roomId,
      p_user_id: userId,
    })
    if (error) throw error
    setRoomMembers(prev => ({ ...prev, [roomId]: [...(prev[roomId] ?? []), userId] }))
  }, [])

  const removeMember = useCallback(async (roomId: string, userId: string) => {
    const { error } = await supabase.rpc('remove_sub_channel_member', {
      p_sub_channel_id: roomId,
      p_user_id: userId,
    })
    if (error) throw error
    setRoomMembers(prev => ({ ...prev, [roomId]: (prev[roomId] ?? []).filter(id => id !== userId) }))
  }, [])

  const subChannels = rooms.filter(r => !r.is_archived)
  const archivedRooms = rooms.filter(r => r.is_archived)

  return { subChannels, archivedRooms, roomMembers, loading, error, create, rename, setArchived, setCapabilities, setVisibility, addMember, removeMember, remove, refetch }
}
