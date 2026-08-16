// Subscription persistence and reconciliation for push notifications (#191).
// Extracted from the usePushNotifications hook so startup/foreground
// reconciliation and endpoint rotation are reusable and unit-testable.

import { supabase } from './supabase'

type PushSubscriptionsClient = typeof supabase

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PersistResult {
  ok: boolean
  error?: Error
}

// Maps a PushSubscription object (as handed to the page) to its DB columns.
export function subscriptionToRow(subscription: PushSubscription): PushSubscriptionRow {
  return subscriptionJsonToRow(subscription.toJSON())
}

// Maps the subscription JSON shape (PushSubscriptionJSON, or the object the
// service worker relays via PUSH_SUBSCRIPTION_CHANGED) to DB columns.
export function subscriptionJsonToRow(
  json: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null | undefined
): PushSubscriptionRow {
  return {
    endpoint: json?.endpoint ?? '',
    p256dh: json?.keys?.p256dh ?? '',
    auth: json?.keys?.auth ?? ''
  }
}

// The browser's current subscription, or null when push is unsupported or the
// user is not subscribed.
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

// Upserts the subscription row. Returns { ok: false, error } instead of
// throwing so callers can surface persistence failures explicitly.
export async function persistPushSubscription(
  userId: string,
  subscription: PushSubscriptionRow,
  client: PushSubscriptionsClient = supabase
): Promise<PersistResult> {
  const { error } = await client
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth
      },
      { onConflict: 'user_id,endpoint' }
    )
  return error ? { ok: false, error: error as Error } : { ok: true }
}

// Reconciles the server with the browser's current subscription: reads the
// active PushSubscription and upserts its endpoint/keys. No-op when there is
// no active subscription (nothing to persist). Surfaces any failure instead of
// silently leaving the browser subscribed but absent from push_subscriptions.
export async function reconcilePushSubscription(
  userId: string,
  client: PushSubscriptionsClient = supabase
): Promise<PersistResult> {
  try {
    const subscription = await getActiveSubscription()
    if (!subscription) return { ok: true }
    return persistPushSubscription(userId, subscriptionToRow(subscription), client)
  } catch (err) {
    return { ok: false, error: err as Error }
  }
}
