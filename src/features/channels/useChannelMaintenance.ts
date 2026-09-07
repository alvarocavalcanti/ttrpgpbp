import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/supabasePagination'

// Data layer for ChannelSettings' maintenance actions (ARCH-1): the chat-log
// export query and the archive update live here; the component keeps the
// markdown/blob UX and toasts.

export function useChannelMaintenance() {
  // Full (paginated) fetch of a channel's live messages for the markdown
  // export; oldest-first ordering is part of the export contract.
  const fetchChannelMessages = async (channelId: string) =>
    fetchAllRows(
      supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
        .eq('channel_id', channelId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    )

  const archiveChannel = async (channelId: string) => {
    const { error } = await supabase
      .from('channels')
      .update({ is_archived: true })
      .eq('id', channelId)
    return error
  }

  return { fetchChannelMessages, archiveChannel }
}
