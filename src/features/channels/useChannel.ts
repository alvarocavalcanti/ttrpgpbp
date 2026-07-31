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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    if (!channelId || !user) {
      setLoading(false)
      return
    }

    async function fetchChannelData() {
      try {
        const [channelResponse, membersResponse] = await Promise.all([
          supabase.from('channels').select('*').eq('id', channelId as string).single(),
          supabase.from('channel_members').select('*, profile:profiles(display_name, avatar_url)').eq('channel_id', channelId as string)
        ])

        if (channelResponse.error) throw channelResponse.error
        if (membersResponse.error) throw membersResponse.error

        if (mounted) {
          setChannel(channelResponse.data)
          // The join to profiles might return an array if not configured correctly, 
          // but our schema links user_id to profiles(id) uniquely.
          const formattedMembers = membersResponse.data.map(m => ({
            ...m,
            profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
          })) as ChannelMember[]
          
          setMembers(formattedMembers)
        }
      } catch (err: any) {
        console.error('Error fetching channel data:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchChannelData()

    return () => {
      mounted = false
    }
  }, [channelId, user])

  const isGM = channel?.gm_id === user?.id
  const myMemberInfo = members.find(m => m.user_id === user?.id)

  return { channel, members, loading, error, isGM, myMemberInfo }
}
