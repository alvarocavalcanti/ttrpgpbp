import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { subscribeWithRetry } from '../../lib/realtime'

// Catch-up horizon for unresolved X-Card events on GM mount (issue #411).
const CATCHUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Anonymous X-Card safety tool. The presser's identity is never stored (no
// user_id on the row); the GM alone sees the alert.
export function useSafetyCardEvents(channelId: string | undefined, isGM: boolean) {
  const { addToast } = useToast()
  const [alertActive, setAlertActive] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  // Live count so dismissAlert can restore it if the persist write fails, and
  // a dismissal latch so an in-flight catch-up SELECT can't re-apply a stale
  // pre-dismissal count after the GM dismissed.
  const alertCountRef = useRef(0)
  alertCountRef.current = alertCount
  const dismissedRef = useRef(false)

  useEffect(() => {
    // Only the GM needs the alert stream; non-GMs shouldn't open a realtime
    // channel just to no-op (H10). triggerXCard is unaffected (players still
    // insert events).
    if (!channelId || !isGM) return

    // Catch up on flags pressed while the GM was away: unresolved events from
    // the last 7 days re-seed the alert. RLS limits reads to the GM, keeping
    // the presser anonymous (issue #411).
    let cancelled = false
    dismissedRef.current = false
    const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString()
    void supabase
      .from('safety_card_events')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .is('resolved_at', null)
      .gt('created_at', since)
      .then(({ count, error }) => {
        if (cancelled || dismissedRef.current) return
        if (error) {
          console.error('Failed to load X-Card alerts:', error)
          addToast('Failed to load X-Card alerts.', 'error')
          return
        }
        if (count && count > 0) {
          setAlertActive(true)
          setAlertCount(count)
        }
      })

    const realtimeChannel = supabase
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
    const stopRealtime = subscribeWithRetry(realtimeChannel, `safety-card:${channelId}`)

    return () => {
      cancelled = true
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
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

  const dismissAlert = useCallback(async () => {
    if (!channelId) return
    const previousCount = alertCountRef.current
    dismissedRef.current = true
    setAlertActive(false)
    setAlertCount(0)
    // Persist the dismissal so it survives reloads (issue #411). Fail-safe:
    // if the write fails, bring the alert back — count included, or a
    // multi-flag alert would lose its tally until reload.
    const { error } = await supabase
      .from('safety_card_events')
      .update({ resolved_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .is('resolved_at', null)
    if (error) {
      console.error('Failed to dismiss X-Card alert:', error)
      dismissedRef.current = false
      setAlertActive(true)
      setAlertCount(previousCount)
      addToast('Failed to dismiss X-Card alert.', 'error')
    }
  }, [channelId, addToast])

  return { alertActive, alertCount, dismissAlert, triggerXCard }
}
