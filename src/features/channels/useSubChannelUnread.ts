import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { subscribeWithRetry } from '../../lib/realtime'
import { RoomUnreadRowSchema, parseRow } from '../validation/rowSchemas'

// Per-room unread dots (#621, decision 4). The channel badge clears when the
// channel opens, so without a room dot the player has no signal of where the
// new posts are. Counts come from get_channel_room_unread (server truth, keyed
// on sub_channel_reads) and are refreshed on channel change, on foreground
// return, and live from room message INSERTs.
//
// History-first: the owner calls markRoomRead only after the room's history
// fetch resolves, so a failed fetch can never clear a dot for unseen posts.
// A message arriving in the room the user is currently viewing instead advances
// that room's read mark (mirroring the channel's live advance in useChannel),
// so a later reopen does not re-flag messages the user already read live.
export function useSubChannelUnread(channelId: string | undefined, activeSubChannelId: string | null) {
  const { user } = useAuth()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  // Read from the realtime handler without re-subscribing on every room switch.
  const activeRef = useRef(activeSubChannelId)
  activeRef.current = activeSubChannelId

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), [])

  const markRoomRead = useCallback(async (roomId: string) => {
    setCounts(prev => (prev[roomId] ? { ...prev, [roomId]: 0 } : prev))
    const { error } = await supabase.rpc('mark_sub_channel_read', { p_sub_channel_id: roomId })
    if (error) console.error('Failed to mark room read', error)
  }, [])

  useEffect(() => {
    let mounted = true
    setCounts({})

    if (!channelId || !user?.id) return

    async function fetchUnread() {
      const { data, error } = await supabase.rpc('get_channel_room_unread', { p_channel_id: channelId as string })
      if (error) {
        console.error('Error fetching room unread:', error)
        return
      }
      const next: Record<string, number> = {}
      for (const row of data ?? []) {
        const parsed = parseRow(RoomUnreadRowSchema, row)
        // The NULL group is Main; its unread lives on the channel badge.
        if (parsed?.sub_channel_id) next[parsed.sub_channel_id] = parsed.unread_count ?? 0
      }
      if (mounted) setCounts(next)
    }

    fetchUnread()

    let firstSubscribe = true
    const realtimeChannel = supabase
      .channel(`channel:${channelId}:room-unread`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (!mounted) return
          const row = payload.new as { sub_channel_id?: string | null; sender_id?: string | null }
          const subId = row.sub_channel_id ?? null
          // Main has no dot.
          if (!subId) return
          // The room the user is looking at: advance its read mark so a later
          // reopen does not re-flag it (mirrors useChannel's live advance).
          if (subId === activeRef.current) {
            if (document.visibilityState === 'visible') void markRoomRead(subId)
            return
          }
          // Other rooms: own messages are already read; anything else lights a dot.
          if (row.sender_id === user?.id) return
          setCounts(prev => ({ ...prev, [subId]: (prev[subId] ?? 0) + 1 }))
        },
      )
    const stopRealtime = subscribeWithRetry(realtimeChannel, `channel:${channelId}:room-unread`, (status) => {
      if (mounted && status === 'SUBSCRIBED') {
        if (firstSubscribe) firstSubscribe = false
        else void fetchUnread()
      }
    })

    // Returning to the tab: the timestamps the counts derive from may have
    // moved while the socket was down, so re-read the server truth.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchUnread()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId, user?.id, markRoomRead, refetchTrigger])

  return { counts, markRoomRead, refetch }
}
