import { supabase } from '../../lib/supabase'

// Data layer for the channel status line (ARCH-1): the status_text update
// lives here; ChannelStatusBar keeps the editing UX and error copy.
export function useChannelStatus() {
  const updateStatus = async (channelId: string, statusText: string) => {
    const { error } = await supabase
      .from('channels')
      .update({ status_text: statusText || null })
      .eq('id', channelId)
    return error
  }

  return { updateStatus }
}
