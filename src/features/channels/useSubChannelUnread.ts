import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { subscribeWithRetry } from '../../lib/realtime'
import { RoomUnreadRowSchema, parseRow } from '../validation/rowSchemas'

// Per-room unread dots (#621, decision 4). Counts come from
// get_channel_room_unread (server truth, keyed on sub_channel_reads and the
// Main read mark) and are refreshed on channel change, on foreground return,
// and live from room message INSERTs. Main is keyed 'main' so the tab bar can
// light it too: reading a room never clears it, so a player who opened a room
// straight from a notification still sees that Main is unread.
//
// History-first: the owner calls markRoomRead only after the room's history
// fetch resolves, so a failed fetch can never clear a dot for unseen posts.
// A message arriving in the room the user is currently viewing instead advances
// that room's read mark (mirroring the channel's live advance in useChannel),
// so a later reopen does not re-flag messages the user already read live.
export function useSubChannelUnread(channelId: string | undefined, activeSubChannelId: string | null, canMarkRead?: () => boolean) {
  const { user } = useAuth()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  // Read from the realtime handler without re-subscribing on every room switch.
  const activeRef = useRef(activeSubChannelId)
  activeRef.current = activeSubChannelId

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), [])

  // Room marks are serialized, mirroring useChannel's write chain (#806): a room
  // read must never commit after a later write for the same surface, or "mark as
  // unread" could be erased by a read that was already in flight. The gate is
  // re-checked inside the chain so a read queued before the gate closed is
  // dropped instead of firing afterwards.
  const readWriteChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const markRoomRead = useCallback((roomId: string) => {
    if (canMarkRead && !canMarkRead()) return readWriteChainRef.current.then(() => {})
    readWriteChainRef.current = readWriteChainRef.current
      .then(async () => {
        if (canMarkRead && !canMarkRead()) return
        setCounts(prev => (prev[roomId] ? { ...prev, [roomId]: 0 } : prev))
        const { error } = await supabase.rpc('mark_sub_channel_read', { p_sub_channel_id: roomId })
        if (error) console.error('Failed to mark room read', error)
      })
      .catch(() => {})
    return readWriteChainRef.current
  }, [canMarkRead])

  // See useChannel.waitForReads: lets the unread write wait out an in-flight
  // room read instead of racing it.
  const waitForReads = useCallback(() => readWriteChainRef.current.then(() => {}), [])

  // Main has no room row to mark; useChannel writes its read mark, so the dot
  // only needs the local count cleared (the next fetch reads the server truth).
  const markMainRead = useCallback(() => {
    setCounts(prev => (prev.main ? { ...prev, main: 0 } : prev))
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
        // The NULL group is Main; every visible room keys by its id.
        if (parsed) next[parsed.sub_channel_id ?? 'main'] = parsed.unread_count ?? 0
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
          const roomId = row.sub_channel_id ?? null
          // The room the user is looking at: advance its read mark so a later
          // reopen does not re-flag it (mirrors useChannel's live advance). Main
          // is deliberately left alone here: useChannel writes its mark, and
          // only once history has loaded — clearing the dot from this event
          // could hide posts the player never saw (a failed history fetch).
          if (roomId === activeRef.current) {
            if (document.visibilityState === 'visible' && roomId) void markRoomRead(roomId)
            return
          }
          // Other rooms: own messages are already read; anything else lights a dot.
          if (row.sender_id === user?.id) return
          const key = roomId ?? 'main'
          setCounts(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
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
  }, [channelId, user?.id, markRoomRead, markMainRead, refetchTrigger])

  return { counts, markRoomRead, markMainRead, refetch, waitForReads }
}
