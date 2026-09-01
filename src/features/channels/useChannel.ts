import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { subscribeWithRetry } from '../../lib/realtime'
import { toError } from '../../lib/errors'

type Channel = Database['public']['Tables']['channels']['Row']
type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

export function useChannel(channelId: string | undefined, onRead?: () => void) {
  const { user } = useAuth()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [gmOnlyResourcesUrl, setGmOnlyResourcesUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  // Stable read boundary for the "New messages" divider. Captured once from the
  // first member fetch; the last_read_at write below (and its realtime echo)
  // would otherwise move the boundary to "now" before the history renders,
  // hiding the divider for messages that were unread when the channel opened.
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)
  const boundaryCapturedRef = useRef(false)
  // My channel_members row id, set once members load. Lets the messages INSERT
  // listener below advance last_read_at without re-deriving membership.
  const myMemberIdRef = useRef<string | null>(null)
  // Serializes last_read_at writes so two overlapping requests can't complete
  // out of order and move the timestamp backward (the unread count derives
  // from last_read_at). Timestamps are generated when the write actually runs,
  // so the persisted value is monotonic. Single-client ordering is enough —
  // cross-device races resolve to whichever write lands last, same as before.
  const readWriteChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const markRead = useCallback(() => {
    if (!myMemberIdRef.current) return
    readWriteChainRef.current = readWriteChainRef.current
      .then(async () => {
        const { error } = await supabase
          .from('channel_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('id', myMemberIdRef.current as string)
        if (error) console.error('Failed to update last_read_at', error)
        else onRead?.()
      })
      .catch(() => {})
  }, [onRead])

  const refetch = () => setRefetchTrigger(prev => prev + 1)

  useEffect(() => {
    let mounted = true
    // Drop any state from a previous channel (route change keeps this hook
    // mounted), so we never render another channel's members/secrets or reuse
    // its read boundary.
    setChannel(null)
    setMembers([])
    setGmOnlyResourcesUrl(null)
    setError(null)
    setLoading(true)
    setLastReadAt(null)
    boundaryCapturedRef.current = false
    myMemberIdRef.current = null

    if (!channelId || !user?.id) {
      setLoading(false)
      return
    }

    // Members + GM secrets. Extracted so a realtime INSERT can refetch with the
    // profile join intact.
    async function loadMembers(): Promise<ChannelMember[]> {
      const [membersResponse, secretsResponse] = await Promise.all([
        supabase.from('channel_members').select('*, profile:profiles(display_name, avatar_url)').eq('channel_id', channelId as string),
        supabase.from('channel_secrets').select('gm_only_resources_url').eq('channel_id', channelId as string).maybeSingle()
      ])
      if (membersResponse.error) throw membersResponse.error

      // The join to profiles might return an array if not configured correctly,
      // but our schema links user_id to profiles(id) uniquely.
      const formattedMembers = (membersResponse.data ?? []).map(m => ({
        ...m,
        profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
      })) as ChannelMember[]

      if (mounted) {
        // channel_secrets is GM-only (RLS); non-GMs get no row.
        setGmOnlyResourcesUrl(secretsResponse.data?.gm_only_resources_url ?? null)
        setMembers(formattedMembers)
        if (!boundaryCapturedRef.current) {
          boundaryCapturedRef.current = true
          setLastReadAt(formattedMembers.find(m => m.user_id === user?.id)?.last_read_at ?? null)
        }
      }
      return formattedMembers
    }

    async function fetchChannelData() {
      try {
        const channelResponse = await supabase.from('channels').select('*').eq('id', channelId as string).single()
        if (channelResponse.error) throw channelResponse.error
        if (mounted) setChannel(channelResponse.data)

        const formattedMembers = await loadMembers()
        if (!mounted) return

        // Mark read in background if we are a member
        const myMember = formattedMembers.find(m => m.user_id === user?.id)
        if (myMember) {
          myMemberIdRef.current = myMember.id
          markRead()
        }
      } catch (err) {
        console.error('Error fetching channel data:', err)
        if (mounted) setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchChannelData()

    let firstSubscribe = true
    const realtimeChannel = supabase
      .channel(`channel:${channelId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'channels',
        filter: `id=eq.${channelId}`
      }, (payload) => {
        if (mounted) {
          setChannel(prev => prev ? { ...prev, ...payload.new } as Channel : prev)
        }
      })
      .on('postgres_changes', {
        // Messages arriving while the user sits in the channel keep advancing
        // last_read_at, so the Lobby unread badge doesn't re-count messages
        // already read live (#336). The "New messages" divider boundary stays
        // frozen (regression #213) — only the persisted read mark moves.
        // ponytail: one write per arriving message; debounce only if write
        // volume ever shows up.
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`
      }, () => {
        if (!mounted || document.visibilityState !== 'visible' || !myMemberIdRef.current) return
        markRead()
      })
      .on('postgres_changes', {
        // '*' so joins (INSERT) and kicks/leaves (DELETE) propagate. A kicked
        // user's own client drops their member row and the ChannelView guard
        // redirects them; other clients see the list update immediately.
        event: '*',
        schema: 'public',
        table: 'channel_members',
        filter: `channel_id=eq.${channelId}`
      }, (payload) => {
        if (!mounted) return
        if (payload.eventType === 'INSERT') {
          // Refetch to pick up the profile join for the new member.
          void loadMembers().catch(err => console.error('Error refreshing members:', err))
        } else if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string } | null)?.id
          if (oldId) setMembers(prev => prev.filter(m => m.id !== oldId))
        } else {
          setMembers(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        }
      })
    const stopRealtime = subscribeWithRetry(realtimeChannel, `channel:${channelId}`, (status) => {
      if (mounted && status === 'SUBSCRIBED') {
        if (firstSubscribe) {
          firstSubscribe = false
        } else {
          void fetchChannelData()
        }
      }
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchChannelData()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId, user?.id, refetchTrigger])

  const isGM = channel?.gm_id === user?.id
  const myMemberInfo = members.find(m => m.user_id === user?.id)

  return { channel, members, gmOnlyResourcesUrl, loading, error, isGM, myMemberInfo, lastReadAt, refetch }
}
