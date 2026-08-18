import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'

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

  const refetch = () => setRefetchTrigger(prev => prev + 1)

  useEffect(() => {
    let mounted = true
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

        // Update last_read_at in background if we are a member
        const myMember = formattedMembers.find(m => m.user_id === user?.id)
        if (myMember) {
          supabase
            .from('channel_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('id', myMember.id)
            .then(({ error }) => {
              if (error) console.error('Failed to update last_read_at', error)
              else onRead?.()
            })
        }
      } catch (err: any) {
        console.error('Error fetching channel data:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchChannelData()

    const channelSubscription = supabase
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
      .subscribe()

    return () => {
      mounted = false
      channelSubscription.unsubscribe()
    }
  }, [channelId, user?.id, refetchTrigger])

  const isGM = channel?.gm_id === user?.id
  const myMemberInfo = members.find(m => m.user_id === user?.id)

  return { channel, members, gmOnlyResourcesUrl, loading, error, isGM, myMemberInfo, lastReadAt, refetch }
}
