import { supabase } from '../../lib/supabase'

export type ModerationAction = 'block' | 'unblock' | 'kick' | 'leave'

// Data layer for member moderation (ARCH-1): the moderate_member RPC and the
// away-status update live here; MemberList keeps the UX and error copy.
export function useMemberModeration() {
  const moderateMember = async (channelId: string, memberId: string, action: ModerationAction) => {
    const { error } = await supabase.rpc('moderate_member', {
      p_channel_id: channelId,
      p_member_id: memberId,
      p_action: action
    })
    return error
  }

  const setAway = async (memberId: string, isAway: boolean, awayMessage: string | null) => {
    const { error } = await supabase
      .from('channel_members')
      .update({ is_away: isAway, away_message: awayMessage })
      .eq('id', memberId)
    return error
  }

  return { moderateMember, setAway }
}
