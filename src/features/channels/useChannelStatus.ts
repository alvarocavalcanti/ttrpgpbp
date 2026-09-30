import { supabase } from '../../lib/supabase'

// Data layer for the channel status line (ARCH-1): the status_text update goes
// through the update_channel_status RPC (GM-only, server-authoritative) so it
// can post the system announcement in the same transaction — clients cannot
// insert `system` messages directly. ChannelStatusBar keeps the editing UX and
// error copy.
export function useChannelStatus() {
  const updateStatus = async (channelId: string, statusText: string) => {
    const { error } = await supabase.rpc('update_channel_status', {
      p_channel_id: channelId,
      p_status_text: statusText
    })
    return error
  }

  return { updateStatus }
}
