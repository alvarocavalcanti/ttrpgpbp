import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './useAuth'
import {
  getActiveSubscription,
  persistPushSubscription,
  reconcilePushSubscription,
  subscriptionJsonToRow,
  subscriptionToRow
} from '../../lib/pushSubscription'
import type { Database } from '../../types/database'

type NotificationPrefs = Database['public']['Tables']['notification_preferences']['Row']

// Helper to convert base64 url string to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const PERSIST_ERROR = 'Failed to persist push subscription'

export function usePushNotifications() {
  const { user } = useAuth()
  const [isSupported, setIsSupported] = useState(false)
  const [needsInstall, setNeedsInstall] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)

  const [preferences, setPreferences] = useState<NotificationPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true)
      setPermission(Notification.permission)
    }
    // iOS exposes PushManager only in installed PWAs, not browser tabs.
    const isIOS = /iphone|ipad/i.test(navigator.userAgent)
    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches
    setNeedsInstall(isIOS && !isStandalone)
  }, [])

  useEffect(() => {
    let mounted = true
    if (!user?.id) return

    // Reconciles the server with the browser's current subscription, surfacing
    // failures instead of silently diverging (#191). Safe to call repeatedly:
    // a fresh run is also how endpoint rotation gets repaired.
    async function reconcile() {
      if (!user?.id) return
      const result = await reconcilePushSubscription(user.id)
      if (!result.ok && mounted) {
        setError(result.error ?? new Error(PERSIST_ERROR))
      }
    }

    // The service worker relays browser-initiated subscription rotation via
    // PUSH_SUBSCRIPTION_CHANGED. Persist the fresh credentials while we're
    // authenticated; if no tab is open, the next startup/foreground reconcile
    // repairs it.
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null }
      if (data?.type !== 'PUSH_SUBSCRIPTION_CHANGED' || !data.subscription) return
      if (!user?.id) return

      persistPushSubscription(user.id, subscriptionJsonToRow(data.subscription)).then(result => {
        if (!result.ok) setError(result.error ?? new Error(PERSIST_ERROR))
      })
    }

    async function fetchPrefsAndSub() {
      try {
        // Fetch preferences
        const { data: prefData, error: prefError } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user!.id)
          .single()

        if (prefError && prefError.code !== 'PGRST116') {
          console.error('Error fetching preferences:', prefError)
          if (mounted) setError(prefError as unknown as Error)
        } else if (prefData && mounted) {
          setPreferences(prefData)
        } else if (!prefData && mounted) {
          // Defaults if none
          setPreferences({
            id: 'temp',
            user_id: user!.id,
            push_enabled: true,
            badge_enabled: true,
            email_enabled: false
          })
        }

        // Check if subscribed in SW, then repair the stored subscription.
        if ('serviceWorker' in navigator) {
          const subscription = await getActiveSubscription()
          if (mounted) setIsSubscribed(!!subscription)
          await reconcile()
        }
      } catch (err) {
        console.error('Error in fetchPrefsAndSub', err)
        if (mounted) setError(err as Error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchPrefsAndSub()

    // Reconcile again when the app returns to the foreground: permissions may
    // have been granted/revoked and the browser may have rotated the
    // subscription while the app was in the background.
    function handleVisibility() {
      if (document.visibilityState === 'visible') reconcile()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    navigator.serviceWorker?.addEventListener?.('message', handleMessage)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      navigator.serviceWorker?.removeEventListener?.('message', handleMessage)
    }
  }, [user?.id])

  const subscribeToPush = async () => {
    if (!isSupported || !user) throw new Error('Push not supported or not logged in')

    const permissionResult = await Notification.requestPermission()
    setPermission(permissionResult)

    if (permissionResult !== 'granted') {
      throw new Error('Permission not granted for Notification')
    }

    const registration = await navigator.serviceWorker.ready

    // Subscribe
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) throw new Error('Missing VAPID public key')

    const convertedVapidKey = urlBase64ToUint8Array(vapidKey)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    })

    // Save to Supabase. Surfaced instead of swallowed so the browser is never
    // left subscribed while the server row is missing.
    const result = await persistPushSubscription(user.id, subscriptionToRow(subscription))
    if (!result.ok) throw result.error

    setIsSubscribed(true)
  }

  const unsubscribeFromPush = async () => {
    if (!isSupported || !user) return

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      await subscription.unsubscribe()
      const subJson = subscription.toJSON()

      await supabase
        .from('push_subscriptions')
        .delete()
        .match({ user_id: user.id, endpoint: subJson.endpoint! })

      setIsSubscribed(false)
    }
  }

  const updatePreferences = async (updates: Partial<NotificationPrefs>) => {
    if (!user) return

    const payload = {
      ...preferences,
      ...updates,
      user_id: user.id
    } as any

    delete payload.id

    // Upsert preference
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error
    setPreferences(data)
  }

  const isConfigured = !!import.meta.env.VITE_VAPID_PUBLIC_KEY

  return {
    isSupported,
    needsInstall,
    isConfigured,
    permission,
    isSubscribed,
    preferences,
    loading,
    error,
    subscribeToPush,
    unsubscribeFromPush,
    updatePreferences
  }
}
