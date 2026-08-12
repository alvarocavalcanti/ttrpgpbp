import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'

// Anonymous X-Card safety tool. The presser's identity is never stored (no
// user_id on the row); the GM alone sees the realtime alert.
export function useSafetyCardEvents(channelId: string | undefined, isGM: boolean) {
  const { addToast } = useToast()
  const [alertActive, setAlertActive] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    // Only the GM needs the alert stream; non-GMs shouldn't open a realtime
    // channel just to no-op (H10). triggerXCard is unaffected (players still
    // insert events).
    if (!channelId || !isGM) return

    const sub = supabase
      .channel(`safety-card:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'safety_card_events',
        filter: `channel_id=eq.${channelId}`
      }, () => {
        setAlertActive(true)
        setAlertCount(c => c + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [channelId, isGM])

  const triggerXCard = useCallback(async (messageId?: string): Promise<boolean> => {
    if (!channelId) return false
    const { error } = await supabase
      .from('safety_card_events')
      .insert({ channel_id: channelId, message_id: messageId ?? null })
    if (error) {
      console.error('Failed to trigger X-Card:', error)
      addToast('Failed to trigger X-Card.', 'error')
      return false
    }
    addToast('X-Card sent to the GM', 'success')
    return true
  }, [channelId, addToast])

  return { alertActive, alertCount, dismissAlert: () => setAlertActive(false), triggerXCard }
}
