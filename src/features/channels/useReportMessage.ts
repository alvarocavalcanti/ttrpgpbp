import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { ChatMessage } from '../chat/types'

// Data layer for the player-facing report flow (#467, ARCH-1): the insert
// into abuse_reports lives here; ChannelView keeps the toasts. RLS enforces
// reporter_id = auth.uid() server-side.
export function useReportMessage() {
  // Stable identity so ChannelView's memoized MessageItem list doesn't
  // re-render on every ChannelView render.
  const reportMessage = useCallback(async (reporterId: string, message: ChatMessage, reason: string) => {
    const { error } = await supabase.from('abuse_reports').insert({
      reporter_id: reporterId,
      reported_user_id: message.sender_id,
      channel_id: message.channel_id,
      message_id: message.id,
      reason,
    })
    return error
  }, [])

  return { reportMessage }
}
