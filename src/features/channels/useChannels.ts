import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'

type Channel = Database['public']['Tables']['channels']['Row']
type ChannelMember = Database['public']['Tables']['channel_members']['Row']

export function useChannels() {
  const { user } = useAuth()
  const [publicChannels, setPublicChannels] = useState<Channel[]>([])
  const [myChannels, setMyChannels] = useState<(Channel & { member: ChannelMember, unread_count?: number })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchChannels() {
      if (!user) return

      try {
        // Fetch public channels
        const { data: publicData, error: publicError } = await supabase
          .from('channels')
          .select('*')
          .eq('is_public', true)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })

        if (publicError) throw publicError

        // Fetch my channels (via channel_members)
        const { data: memberData, error: memberError } = await supabase
          .from('channel_members')
          .select('*, channel:channels!inner(*)')
          .eq('user_id', user.id)
          .eq('channel.is_archived', false)

        if (memberError) throw memberError

        if (mounted) {
          setPublicChannels(publicData || [])
          
          // Format my channels
          const formattedMyChannels = await Promise.all((memberData || []).map(async row => {
            const channelData = Array.isArray(row.channel) ? row.channel[0] : row.channel
            const memberInfo = {
              id: row.id,
              channel_id: row.channel_id,
              user_id: row.user_id,
              character_name: row.character_name,
              character_avatar_url: row.character_avatar_url,
              character_sheet_url: row.character_sheet_url,
              is_active_player: row.is_active_player,
              is_blocked: row.is_blocked,
              joined_at: row.joined_at,
              last_read_at: row.last_read_at
            } as ChannelMember

            let unread_count = 0
            if (memberInfo.last_read_at) {
              const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('channel_id', memberInfo.channel_id)
                .gt('created_at', memberInfo.last_read_at)
              unread_count = count || 0
            }

            return {
              ...channelData,
              member: memberInfo,
              unread_count
            }
          })) as (Channel & { member: ChannelMember, unread_count?: number })[]
          
          if (mounted) setMyChannels(formattedMyChannels)
        }
      } catch (error) {
        console.error('Error fetching channels:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchChannels()

    return () => {
      mounted = false
    }
  }, [user])

  return { publicChannels, myChannels, loading }
}
