import { supabase } from '../../lib/supabase'

// Data layer for the status line (ARCH-1): the status update goes through the
// update_channel_status RPC (GM-only, server-authoritative) so it can post the
// system announcement in the same transaction — clients cannot insert `system`
// messages directly. A null subChannelId targets Main (channels.status_text);
// a room id targets that room (sub_channels.status_text) and posts the note
// into it. ChannelStatusBar keeps the editing UX and error copy.
export function useChannelStatus() {
  const updateStatus = async (channelId: string, statusText: string, subChannelId: string | null = null) => {
    const { error } = await supabase.rpc('update_channel_status', {
      p_channel_id: channelId,
      p_status_text: statusText,
      // Omitted for Main so the RPC's default (NULL) applies.
      p_sub_channel_id: subChannelId ?? undefined
    })
    return error
  }

  return { updateStatus }
}
