import { supabase } from '../../lib/supabase'

// Data layer for channel creation (ARCH-1): the channel-cap pre-check and the
// create_channel RPC live here; CreateChannelModal keeps the form UX.
export function useCreateChannel() {
  // Pre-check the channel cap so we don't leave an orphaned channel row
  // when the create_channel RPC rejects the insert.
  const countMyChannels = async (userId: string): Promise<number> => {
    const { count } = await supabase
      .from('channel_members')
      .select('*, channel:channels!inner(id)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('channel.is_archived', false)
    return count || 0
  }

  // Single transactional RPC: channel + secrets + GM membership either all
  // commit or all roll back, so a partial failure can't orphan a channel.
  const createChannel = async (params: {
    name: string
    gameSystem: string
    inviteCode: string
    characterName: string
    passwordHash?: string
    passwordSalt?: string
  }): Promise<string> => {
    const { data: channelId, error: rpcError } = await supabase.rpc('create_channel', {
      p_name: params.name,
      p_game_system: params.gameSystem,
      p_invite_code: params.inviteCode,
      p_character_name: params.characterName,
      p_password_hash: params.passwordHash,
      p_password_salt: params.passwordSalt
    })
    if (rpcError) throw rpcError
    if (!channelId) throw new Error('Failed to create channel')
    return channelId
  }

  return { countMyChannels, createChannel }
}
