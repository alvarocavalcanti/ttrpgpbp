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
  // Sticky signal that the mount-time catch-up SELECT failed (P2-17): a bare
  // toast leaves the GM session looking like a clean table. Cleared by a
  // successful retry, a successful snapshot, or a live INSERT (the stream
  // working makes the stale snapshot moot).
  const [catchUpError, setCatchUpError] = useState(false)
  // Dismissal latch so an in-flight catch-up SELECT can't re-apply a stale
  // pre-dismissal count after the GM dismissed.
  const dismissedRef = useRef(false)

  useEffect(() => {
    // Only the GM needs the alert stream; non-GMs shouldn't open a realtime
    // channel just to no-op (H10). triggerXCard is unaffected (players still
    // insert events).
    if (!channelId || !isGM) return

    let cancelled = false
    dismissedRef.current = false
    setCatchUpError(false)
    const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString()

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
        setCatchUpError(false)
      })
    // The catch-up snapshot waits for SUBSCRIBED: a query fired during setup
    // misses an X-Card INSERT landing in the same window (Postgres Changes
    // doesn't replay missed events), leaving the alert dark. Merging with the
    // live count (Math.max) keeps a live-arrived count from being erased by
    // a snapshot that predates it.
    const stopRealtime = subscribeWithRetry(realtimeChannel, `safety-card:${channelId}`, (status) => {
      if (status !== 'SUBSCRIBED') return
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
            setCatchUpError(true)
            return
          }
          if (count && count > 0) {
            setAlertActive(true)
            setAlertCount(prev => Math.max(prev, count))
          }
        })
    })

    return () => {
      cancelled = true
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId, isGM])

  // P2-17 companion to the catch-up query above: re-runs the same head-count
  // with the same merge semantics (latch check, Math.max). Kept as a separate
  // callback so the flagged SUBSCRIBED-then-query state machine stays as-is.
  const retryCatchUp = useCallback(() => {
    if (!channelId || !isGM) return
    const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString()
    void supabase
      .from('safety_card_events')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .is('resolved_at', null)
      .gt('created_at', since)
      .then(({ count, error }) => {
        if (dismissedRef.current) return
        if (error) {
          console.error('Failed to load X-Card alerts:', error)
          addToast('Failed to load X-Card alerts.', 'error')
          setCatchUpError(true)
          return
        }
        setCatchUpError(false)
        if (count && count > 0) {
          setAlertActive(true)
          setAlertCount(prev => Math.max(prev, count))
        }
      })
  }, [channelId, isGM, addToast])

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
    // Committed state, not a render-written ref (React Doctor
    // no-ref-current-in-render): the callback is re-created on count changes,
    // so it always sees the count as of its scheduling time.
    const previousCount = alertCount
    dismissedRef.current = true
    setAlertActive(false)
    setAlertCount(0)
    // Persist the dismissal so it survives reloads (issue #411), and close
    // the loop for the table (issue #434): one atomic RPC resolves the
    // unresolved events AND posts the identity-free system message every
    // member already receives through the normal message pipeline. Fail-safe:
    // if the write fails, bring the alert back — count included, or a
    // multi-flag alert would lose its tally until reload.
    const { error } = await supabase.rpc('resolve_safety_card_events', { p_channel_id: channelId })
    if (error) {
      console.error('Failed to dismiss X-Card alert:', error)
      dismissedRef.current = false
      setAlertActive(true)
      setAlertCount(previousCount)
      addToast('Failed to dismiss X-Card alert.', 'error')
    }
  }, [channelId, addToast, alertCount])

  return { alertActive, alertCount, catchUpError, retryCatchUp, dismissAlert, triggerXCard }
}
