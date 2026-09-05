import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface JoinChannelPreview {
  id: string
  name: string
  game_system: string
  has_password: boolean
}

// Data layer for the join flow (ARCH-1): the channel preview query and the
// join/salt RPCs live here, JoinChannel keeps the form UX.
export function useChannelJoin(channelId: string | undefined) {
  const [channel, setChannel] = useState<JoinChannelPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchPreview() {
      if (!channelId) {
        if (mounted) setLoading(false)
        return
      }
      try {
        const { data, error: rpcError } = await supabase.rpc('get_join_channel_preview', { p_channel_id: channelId })
        if (rpcError) throw rpcError
        const preview = Array.isArray(data) && data.length > 0 ? data[0] : null
        if (mounted) setChannel(preview)
      } catch (err) {
        console.error('Error fetching channel to join:', err)
        if (mounted) setError(err as Error)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchPreview()
    return () => { mounted = false }
  }, [channelId])

  // Fetches the channel's stored salt; null means legacy pre-salt channel.
  const getChannelSalt = async (id: string): Promise<string | null> => {
    const { data: salt, error: saltError } = await supabase.rpc('get_channel_salt', { p_channel_id: id })
    if (saltError) throw saltError
    return typeof salt === 'string' && salt ? salt : null
  }

  // Joins the channel; member row, attributes and join message commit
  // atomically server-side. Resolves with the RPC result or throws.
  const joinChannel = async (params: {
    characterName: string
    passwordHash?: string
    inviteCode?: string
    characterAttributes: Record<string, number>
  }) => {
    if (!channelId) throw new Error('Missing channel id.')
    const { data, error: rpcError } = await supabase.rpc('join_channel', {
      p_channel_id: channelId,
      p_character_name: params.characterName,
      p_password_hash: params.passwordHash,
      p_invite_code: params.inviteCode,
      p_character_attributes: params.characterAttributes
    })
    if (rpcError) throw rpcError
    return data as { success: boolean; error?: string } | null
  }

  return { channel, loading, error, getChannelSalt, joinChannel }
}
