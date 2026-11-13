import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { toError } from '../../lib/errors'

// Data layer for "mark as unread" (#806): the RPC rewinds the reader's mark for
// the message's surface (Main's own column, or the room's read row) to just
// before the message, so every existing unread reader — the Lobby pill, the room
// tabs, the launcher badge — lights up on the next fetch. ChannelView keeps the
// toasts; returning the error (never throwing) keeps that split and keeps the
// callback identity stable for React.memo on MessageItem (#408).
export function useMarkMessageUnread() {
  const markUnreadMessage = useCallback(async (messageId: string) => {
    try {
      const { error } = await supabase.rpc('mark_message_unread', { p_message_id: messageId })
      return error
    } catch (err) {
      // A transport failure would otherwise reject inside a click handler.
      return toError(err)
    }
  }, [])

  return { markUnreadMessage }
}
