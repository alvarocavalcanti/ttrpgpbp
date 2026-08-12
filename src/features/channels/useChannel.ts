import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'

type Channel = Database['public']['Tables']['channels']['Row']
type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

export function useChannel(channelId: string | undefined) {
  const { user } = useAuth()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [gmOnlyResourcesUrl, setGmOnlyResourcesUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = () => setRefetchTrigger(prev => prev + 1)

  useEffect(() => {
    let mounted = true
    if (!channelId || !user?.id) {
      setLoading(false)
      return
    }

    async function fetchChannelData() {
      try {
        const [channelResponse, membersResponse, secretsResponse] = await Promise.all([
          supabase.from('channels').select('*').eq('id', channelId as string).single(),
          supabase.from('channel_members').select('*, profile:profiles(display_name, avatar_url)').eq('channel_id', channelId as string),
          supabase.from('channel_secrets').select('gm_only_resources_url').eq('channel_id', channelId as string).maybeSingle()
        ])

        if (channelResponse.error) throw channelResponse.error
        if (membersResponse.error) throw membersResponse.error

        if (mounted) {
          setChannel(channelResponse.data)
          // channel_secrets is GM-only (RLS); non-GMs get no row.
          setGmOnlyResourcesUrl(secretsResponse.data?.gm_only_resources_url ?? null)
          // The join to profiles might return an array if not configured correctly, 
          // but our schema links user_id to profiles(id) uniquely.
          const formattedMembers = membersResponse.data.map(m => ({
            ...m,
            profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
          })) as ChannelMember[]
          
          setMembers(formattedMembers)

          // Update last_read_at in background if we are a member
          const myMember = formattedMembers.find(m => m.user_id === user?.id)
          if (myMember) {
            supabase
              .from('channel_members')
              .update({ last_read_at: new Date().toISOString() })
              .eq('id', myMember.id)
              .then(({ error }) => {
                if (error) console.error('Failed to update last_read_at', error)
              })
          }
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
        event: 'UPDATE',
        schema: 'public',
        table: 'channel_members',
        filter: `channel_id=eq.${channelId}`
      }, (payload) => {
        if (mounted) {
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

  return { channel, members, gmOnlyResourcesUrl, loading, error, isGM, myMemberInfo, refetch }
}
