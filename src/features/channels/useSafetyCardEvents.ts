import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { subscribeWithRetry } from '../../lib/realtime'

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
  // Monotonic generation token for async recounts. Every recount (mount
  // catch-up, UPDATE-driven) captures it when issued; dismissals and live
  // INSERTs bump it. A recount completing against a bumped generation is
  // stale — it snapshot an older table state — and must not resurrect a
  // banner that a newer clear (or live count) already superseded.
  const stateGenRef = useRef(0)

  useEffect(() => {
    // Only the GM needs the alert stream; non-GMs shouldn't open a realtime
    // channel just to no-op (H10). triggerXCard is unaffected (players still
    // insert events).
    if (!channelId || !isGM) return

    let cancelled = false
    stateGenRef.current = 0
    setCatchUpError(false)

    const realtimeChannel = supabase
      .channel(`safety-card:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'safety_card_events',
        filter: `channel_id=eq.${channelId}`
      }, () => {
        // Invalidate any in-flight recount that snapshot pre-INSERT state, so
        // a zero count from it can't erase this flag after the fact.
        stateGenRef.current++
        setAlertActive(true)
        setAlertCount(c => c + 1)
        setCatchUpError(false)
      })
      // Dismissals persist as UPDATEs (resolved_at), so the GM's other live
      // tabs/devices learn about them here (finding P2.13): re-count
      // unresolved events the same way the catch-up does. An error leaves the
      // state as-is — no toast, this fires per event and self-heals on the
      // next one or on reconnect. A zero count clears the banner: the event
      // itself proves a resolved_at transition happened, and a banner over
      // zero unresolved rows is a false alarm this UI never shows otherwise.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'safety_card_events',
        filter: `channel_id=eq.${channelId}`
      }, () => {
        // Every realtime event invalidates recounts already in flight: an
        // earlier event's SELECT may have snapshot a pre-dismissal table
        // state that would otherwise overwrite this event's fresher view
        // when it completes late (older positive re-opening over a newer
        // zero).
        stateGenRef.current++
        const gen = stateGenRef.current
        void supabase
          .from('safety_card_events')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', channelId)
          .is('resolved_at', null)
          .then(({ count, error }) => {
            if (cancelled || gen !== stateGenRef.current) return
            if (error) {
              console.error('Failed to refresh X-Card alerts:', error)
              return
            }
            if (count && count > 0) {
              setAlertActive(true)
              setAlertCount(prev => Math.max(prev, count))
            } else {
              setAlertActive(false)
              setAlertCount(0)
            }
          })
      })
    // The catch-up snapshot (issue #411) waits for SUBSCRIBED: a query fired
    // during setup misses an X-Card INSERT landing in the same window
    // (Postgres Changes doesn't replay missed events), leaving the alert
    // dark. Merging with the live count (Math.max) keeps a live-arrived count
    // from being erased by a snapshot that predates it. The count covers ALL
    // unresolved events with no age horizon: unresolved = unhandled, since
    // rows predating persisted dismissal were backfilled resolved by
    // migration 20260907131618_xcard_backfill_pre_resolution_rows (issue
    // #431 — a GM away >7 days no longer misses a flag pressed while away).
    const stopRealtime = subscribeWithRetry(realtimeChannel, `safety-card:${channelId}`, (status) => {
      if (status !== 'SUBSCRIBED') return
      const gen = stateGenRef.current
      void supabase
        .from('safety_card_events')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', channelId)
        .is('resolved_at', null)
        .then(({ count, error }) => {
          if (cancelled || gen !== stateGenRef.current) return
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
          } else {
            // A reconnect snapshot of zero unresolved rows heals a stale
            // banner: Postgres Changes doesn't replay events missed while
            // the socket was down, so this recount is the only path that
            // learns a dismissal happened on another device (same authority
            // as the UPDATE handler's clear).
            setAlertActive(false)
            setAlertCount(0)
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
  // with the same merge semantics (generation check, Math.max). Kept as a
  // separate callback so the flagged SUBSCRIBED-then-query state machine
  // stays as-is. Guarded by requestedChannelRef: a retry fired for channel A
  // must never apply to channel B if the hook is retargeted before the
  // response lands.
  const requestedChannelRef = useRef<string | undefined>(undefined)
  requestedChannelRef.current = channelId
  const retryCatchUp = useCallback(() => {
    if (!channelId || !isGM) return
    const requestedChannelId = channelId
    const gen = stateGenRef.current
    void supabase
      .from('safety_card_events')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .is('resolved_at', null)
      .then(({ count, error }) => {
        if (gen !== stateGenRef.current || requestedChannelRef.current !== requestedChannelId) return
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
    // Drop any in-flight recount that snapshot pre-dismissal state before the
    // optimistic clear — it must not resurrect a stale count afterwards.
    stateGenRef.current++
    setAlertActive(false)
    setAlertCount(0)
    // Persist the dismissal so it survives reloads (issue #411), and close
    // the loop for the table (issue #434): one atomic RPC resolves the
    // unresolved events AND posts the identity-free system message every
    // member already receives through the normal message pipeline. Fail-safe:
    // if the write fails, bring the alert back — count included, or a
    // multi-flag alert would lose its tally until reload. On success there is
    // no latch to hold: the UPDATE echo from the RPC (ours or another
    // device's) recounts live state, so the banner stays syncable for the
    // mount's lifetime.
    const { error } = await supabase.rpc('resolve_safety_card_events', { p_channel_id: channelId })
    if (error) {
      console.error('Failed to dismiss X-Card alert:', error)
      setAlertActive(true)
      setAlertCount(previousCount)
      addToast('Failed to dismiss X-Card alert.', 'error')
    }
  }, [channelId, addToast, alertCount])

  return { alertActive, alertCount, catchUpError, retryCatchUp, dismissAlert, triggerXCard }
}
