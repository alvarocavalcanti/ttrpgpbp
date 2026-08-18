import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type RealtimeStatus = 'Connected' | 'Reconnecting' | 'Offline'

type ChannelState = 'connected' | 'reconnecting'
type RealtimeSubscriptionCallback = NonNullable<Parameters<RealtimeChannel['subscribe']>[0]>
type RealtimeSubscriptionStatus = Parameters<RealtimeSubscriptionCallback>[0]
type RetryableChannel = Pick<RealtimeChannel, 'subscribe'> & Partial<Pick<RealtimeChannel, 'unsubscribe'>>

const channelStates = new Map<string, ChannelState>()
const listeners = new Set<() => void>()
let offline = typeof navigator !== 'undefined' && !navigator.onLine
let snapshot: RealtimeStatus = offline ? 'Offline' : 'Connected'

function getSnapshot(): RealtimeStatus {
  return snapshot
}

function updateSnapshot() {
  const next: RealtimeStatus = offline
    ? 'Offline'
    : [...channelStates.values()].some(state => state === 'reconnecting')
      ? 'Reconnecting'
      : 'Connected'

  if (next === snapshot) return
  snapshot = next
  listeners.forEach(listener => listener())
}

function setOffline(value: boolean) {
  offline = value
  updateSnapshot()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOffline(false))
  window.addEventListener('offline', () => setOffline(true))
}

export function subscribeRealtimeStatus(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function reportRealtimeStatus(channelId: string, status: string) {
  channelStates.set(channelId, status === 'SUBSCRIBED' ? 'connected' : 'reconnecting')
  updateSnapshot()
}

export function clearRealtimeStatus(channelId: string) {
  channelStates.delete(channelId)
  updateSnapshot()
}

export function useRealtimeStatus() {
  return useSyncExternalStore(subscribeRealtimeStatus, getSnapshot, () => 'Connected')
}

const RETRYABLE_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])

// Supabase retries transport connections, but closed channels need an explicit
// resubscribe so each feature can recover after sleep or a network change.
export function subscribeWithRetry(
  channel: RetryableChannel,
  channelId: string,
  onStatus?: (status: RealtimeSubscriptionStatus) => void,
) {
  let active = true
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAttempt = 0
  let currentSubscription: { unsubscribe?: () => unknown } | undefined

  const subscribe = () => {
    if (!active) return
    currentSubscription = channel.subscribe((status) => {
      reportRealtimeStatus(channelId, status)
      onStatus?.(status)

      if (status === 'SUBSCRIBED') {
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = undefined
        }
        retryAttempt = 0
        return
      }

      if (!RETRYABLE_STATUSES.has(status) || !active || retryTimer) return
      const delay = Math.min(1000 * 2 ** retryAttempt, 30_000)
      retryAttempt += 1
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        subscribe()
      }, delay)
    }) as { unsubscribe?: () => unknown }
  }

  subscribe()

  return () => {
    active = false
    if (retryTimer) clearTimeout(retryTimer)
    if (typeof channel.unsubscribe === 'function') {
      void channel.unsubscribe()
    } else {
      void currentSubscription?.unsubscribe?.()
    }
    clearRealtimeStatus(channelId)
  }
}
