import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { subscribeRealtimeStatus, subscribeWithRetry } from '../../lib/realtime'
import { ChannelMemberRowSchema, ChannelRowSchema, parseRow } from '../validation/rowSchemas'

type Channel = Database['public']['Tables']['channels']['Row']
type ChannelMember = Database['public']['Tables']['channel_members']['Row']

// Sorts by most recent message, falling back to creation time. Channels with
// no messages always sort last. Deterministic so lobby order is stable across refreshes.
function byRecentActivity(a: { last_message_at?: string | null, created_at?: string }, b: { last_message_at?: string | null, created_at?: string }) {
  const aHasMessage = Boolean(a.last_message_at)
  const bHasMessage = Boolean(b.last_message_at)
  if (aHasMessage && bHasMessage) {
    if (a.last_message_at !== b.last_message_at) return (b.last_message_at || '').localeCompare(a.last_message_at || '')
    return (b.created_at || '').localeCompare(a.created_at || '')
  }
  if (aHasMessage) return -1
  if (bHasMessage) return 1
  return (b.created_at || '').localeCompare(a.created_at || '')
}

export function useChannels() {
  // authLoading: don't fire the first channels query while the auth client is
  // still resolving its session (issue #315) — a fresh sign-up racing session
  // restore can hit the API with auth.uid() not yet established and turn a
  // recoverable timing artifact into the lobby's "Failed to load channels".
  const { user, loading: authLoading } = useAuth()
  const [myChannels, setMyChannels] = useState<(Channel & { member: ChannelMember, unread_count?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Tracks my channel ids so the lobby messages subscription below can ignore
  // INSERTs for channels I am not a member of.
  const myChannelIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true

    async function fetchChannels() {
      if (!user?.id || authLoading) return

      try {
        // Fetch my channels (via channel_members)
        const { data: memberData, error: memberError } = await supabase
          .from('channel_members')
          .select('*, channel:channels!inner(*)')
          .eq('user_id', user.id)
          .eq('channel.is_archived', false)

        if (memberError) throw memberError

        // Register my channel ids BEFORE the unread RPC so a message INSERT
        // racing the delayed RPC is already recognized as unread-eligible.
        myChannelIdsRef.current = new Set((memberData || []).flatMap(row => {
          const channelData = Array.isArray(row.channel) ? row.channel[0] : row.channel
          const channelId = (channelData as { id?: string } | null)?.id
          return channelId ? [channelId] : []
        }))

        if (mounted) {
          // One RPC for every channel's unread count instead of a count query
          // per channel (C4).
          const { data: unreadData, error: unreadError } = await supabase.rpc('get_user_channels_unread', { p_user_id: user.id })
          if (unreadError) throw unreadError
          const unreadMap = new Map((unreadData || []).map(row => [row.channel_id, row.unread_count]))

          // Format my channels; malformed rows are dropped rather than
          // rendered with undefined props (issue #338 runtime validation).
          const formattedMyChannels = (memberData || []).flatMap(row => {
            const channelData = Array.isArray(row.channel) ? row.channel[0] : row.channel
            const channel = parseRow(ChannelRowSchema, channelData)
            const member = parseRow(ChannelMemberRowSchema, row)
            if (!channel || !member) return []
            return {
              ...channel,
              member: member as ChannelMember,
              unread_count: unreadMap.get(member.channel_id ?? '') ?? 0
            }
          }) as (Channel & { member: ChannelMember, unread_count?: number })[]

          formattedMyChannels.sort(byRecentActivity)

          if (mounted) setMyChannels(formattedMyChannels)
          myChannelIdsRef.current = new Set(formattedMyChannels.map(c => c.id))
        }
      } catch (error) {
        console.error('Error fetching channels:', error)
        if (mounted) setError(error as Error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchChannels()

    function handleServiceWorkerMessage(event: MessageEvent) {
      if (event.data?.type === 'PUSH_RECEIVED') fetchChannels()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchChannels()
    }

    // Trailing 2s debounce so bursts cost one refetch, not one per event.
    // Realtime status flaps (offline/reconnect cycles) route through it too:
    // a flap storm used to refetch the whole lobby per transition (ARCH-6).
    let unreadRefreshTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleUnreadRefresh = () => {
      if (unreadRefreshTimer) return
      unreadRefreshTimer = setTimeout(() => {
        unreadRefreshTimer = undefined
        fetchChannels()
      }, 2000)
    }

    const stopRealtimeStatus = subscribeRealtimeStatus(scheduleUnreadRefresh)

    // Keep unread badges live while sitting in the Lobby: a plain messages
    // INSERT subscription, filtered client-side to my channels, schedules a
    // refetch.
    const lobbyChannel = supabase
      .channel('lobby-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const channelId = (payload.new as { channel_id?: string } | null)?.channel_id
        if (channelId && myChannelIdsRef.current.has(channelId)) scheduleUnreadRefresh()
      })
    const stopLobbyUnread = subscribeWithRetry(lobbyChannel, 'lobby-unread')

    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      stopRealtimeStatus()
      stopLobbyUnread()
      if (unreadRefreshTimer) clearTimeout(unreadRefreshTimer)
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user?.id, authLoading])

  return { myChannels, loading, error }
}
