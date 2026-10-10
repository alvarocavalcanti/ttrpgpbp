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

// `created` distinguishes a heal (a fresh subscription was minted) from a
// routine reconcile of an existing one, so callers only log the interesting
// case.
export interface EnsureResult extends PersistResult {
  created?: boolean
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

// Decodes a base64url VAPID public key into the byte array `subscribe` wants.
// The `<ArrayBuffer>` return type pins it to the non-shared buffer the DOM's
// BufferSource accepts.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Device-local opt-out marker. `unsubscribeFromPush` deletes the browser
// subscription but cannot revoke the granted browser permission, so without a
// marker the next foreground reconcile would silently recreate the
// subscription the user just turned off. Storage can throw (private mode), so
// every access is guarded; a missing value means "not opted out".
const PUSH_OPT_OUT_KEY = 'push:opted-out'

export function isPushOptedOut(): boolean {
  try {
    return localStorage.getItem(PUSH_OPT_OUT_KEY) === '1'
  } catch {
    return false
  }
}

export function markPushOptedOut(): void {
  try {
    localStorage.setItem(PUSH_OPT_OUT_KEY, '1')
  } catch {
    // Best-effort: an unavailable store fails open to the old behavior.
  }
}

export function clearPushOptedOut(): void {
  try {
    localStorage.removeItem(PUSH_OPT_OUT_KEY)
  } catch {
    // ignore
  }
}

// Brings the server in line with the browser's push state. Reads the active
// PushSubscription and upserts it; when the browser has NO subscription but
// permission is already granted and a VAPID key is configured, it CREATES one
// and persists it. That creation is the self-heal path: a subscription lost to
// a 410 deletion, a service-worker unregister, or a silently rotated browser
// token is recreated on the next startup/foreground instead of leaving the
// device permanently push-less. Never prompts (only `Notification.requestPermission`
// does): creating a subscription needs a prior grant, so a silent mild-absence
// of one just no-ops. A device the user deliberately opted out on is left
// alone. Surfaces failures instead of throwing.
export async function ensurePushSubscription(
  userId: string,
  vapidPublicKey: string,
  client: PushSubscriptionsClient = supabase
): Promise<EnsureResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: true }
  if (isPushOptedOut()) return { ok: true }
  try {
    const existing = await getActiveSubscription()
    if (existing) return persistPushSubscription(userId, subscriptionToRow(existing), client)

    if (!vapidPublicKey || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return { ok: true }
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    })
    const result = await persistPushSubscription(userId, subscriptionToRow(subscription), client)
    return { ...result, created: result.ok }
  } catch (err) {
    return { ok: false, error: err as Error }
  }
}

// Client-side push milestone (subscribed / unsubscribed / reconcile_ok /
// reconcile_error). Written straight through PostgREST under the user's own
// RLS policy; best-effort — observability must never break the flow.
export type PushClientStatus = 'subscribed' | 'unsubscribed' | 'reconcile_ok' | 'reconcile_error'

export async function logPushClientEvent(
  userId: string,
  status: PushClientStatus,
  detail?: string,
  client: PushSubscriptionsClient = supabase
): Promise<void> {
  try {
    const { error } = await client.from('push_client_log').insert({
      user_id: userId,
      status,
      detail: detail ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 300) ?? null : null
    })
    if (error) console.error('push client log write failed', error.message)
  } catch (err) {
    console.error('push client log write failed', err)
  }
}
