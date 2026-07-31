import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'

type Channel = Database['public']['Tables']['channels']['Row']
type ChannelMember = Database['public']['Tables']['channel_members']['Row']

export function useChannels() {
  const { user } = useAuth()
  const [publicChannels, setPublicChannels] = useState<Channel[]>([])
  const [myChannels, setMyChannels] = useState<(Channel & { member: ChannelMember })[]>([])
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
          .order('created_at', { ascending: false })

        if (publicError) throw publicError

        // Fetch my channels (via channel_members)
        const { data: memberData, error: memberError } = await supabase
          .from('channel_members')
          .select('*, channel:channels(*)')
          .eq('user_id', user.id)

        if (memberError) throw memberError

        if (mounted) {
          setPublicChannels(publicData || [])
          
          // Format my channels
          const formattedMyChannels = (memberData || []).map(row => {
            const channelData = Array.isArray(row.channel) ? row.channel[0] : row.channel
            return {
              ...channelData,
              member: {
                id: row.id,
                channel_id: row.channel_id,
                user_id: row.user_id,
                character_name: row.character_name,
                character_avatar_url: row.character_avatar_url,
                character_sheet_url: row.character_sheet_url,
                is_active_player: row.is_active_player,
                is_blocked: row.is_blocked,
                joined_at: row.joined_at
              }
            }
          }) as (Channel & { member: ChannelMember })[]
          
          setMyChannels(formattedMyChannels)
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
