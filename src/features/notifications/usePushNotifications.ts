import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import {
  clearPushOptedOut,
  ensurePushSubscription,
  getActiveSubscription,
  logPushClientEvent,
  markPushOptedOut,
  persistPushSubscription,
  subscriptionJsonToRow,
  subscriptionToRow,
  urlBase64ToUint8Array
} from '../../lib/pushSubscription'
import type { Database } from '../../types/database'
import { env } from '../../env'
import { ROUTES } from '../../lib/publicRoutes'

type NotificationPrefs = Database['public']['Tables']['notification_preferences']['Row']

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

    // Brings the browser and server in line with each other and, crucially,
    // RECREATES a subscription the browser lost (410 deletion, SW unregister,
    // token rotation) when permission is already granted (#191). Safe to call
    // repeatedly, and de-duplicated across the hook's several mounts: a fresh
    // run is also how endpoint rotation gets repaired.
    async function reconcile() {
      if (!user?.id) return
      const result = await ensurePushSubscription(user.id, env.VITE_VAPID_PUBLIC_KEY ?? '')
      if (!result.ok) {
        if (mounted) setError(result.error ?? new Error(PERSIST_ERROR))
        return
      }
      const subscription = await getActiveSubscription()
      if (mounted) setIsSubscribed(!!subscription)
    }

    // The service worker relays browser-initiated subscription rotation via
    // PUSH_SUBSCRIPTION_CHANGED. Persist the fresh credentials while we're
    // authenticated; a `null` means the browser revoked the subscription, so
    // reconcile recreates it. If no tab is open, the next startup/foreground
    // reconcile repairs it.
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null }
      if (data?.type !== 'PUSH_SUBSCRIPTION_CHANGED') return
      if (!user?.id) return
      if (!data.subscription) {
        void reconcile()
        return
      }

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

        // Repair — or recover — the stored subscription, then reflect the
        // browser's resulting state in `isSubscribed`.
        if ('serviceWorker' in navigator) {
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

    // The user explicitly enabled this device: clear any prior opt-out so a
    // later reconcile may heal a lost subscription again.
    clearPushOptedOut()

    const registration = await navigator.serviceWorker.ready

    // Subscribe
    const vapidKey = env.VITE_VAPID_PUBLIC_KEY
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
    void logPushClientEvent(user.id, 'subscribed')
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
      // Remember the choice for this device: browser permission stays granted
      // after unsubscribe, so reconcile must not recreate what was turned off.
      markPushOptedOut()
      void logPushClientEvent(user.id, 'unsubscribed')
    }
  }

  // Shows a local notification through the service worker — no push involved.
  // On an installed Android app the phone's own notification permission is the
  // one failure mode the web cannot read, so this is the player's only way to
  // test that display works (#800).
  const sendTestNotification = async () => {
    if (!isSupported || !user) throw new Error('Push not supported or not logged in')
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      throw new Error('Notifications are blocked for this app on this device.')
    }
    // getRegistration, not `.ready`: after the worker is unregistered `.ready`
    // never resolves and the button would hang.
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) throw new Error('Notifications are not set up on this device yet.')

    try {
      await registration.showNotification('Role by Post', {
        body: 'This is how a chat ping will look. Nothing to do — you can dismiss it.',
        // Mirrors the service worker's private icon paths; importing lib/swPush
        // here would pull the push-payload schema into the page bundle.
        icon: '/pwa-192x192.png',
        badge: '/notification-badge.png',
        // Its own tag, so a test never collapses a real message notification.
        tag: 'rbp-test',
        // Reuses the worker's click handler, which only follows site-relative urls.
        data: { url: ROUTES.settings }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Only failures are worth a row: the call resolving does not prove the
      // phone displayed anything.
      void logPushClientEvent(user.id, 'show_error', `test_notification: ${message}`)
      throw err
    }
  }

  const updatePreferences = async (updates: Partial<NotificationPrefs>) => {
    if (!user) return

    const payload = {
      ...preferences,
      ...updates,
      user_id: user.id
    }

    delete (payload as Partial<NotificationPrefs>).id

    // Upsert preference
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error
    setPreferences(data)
  }

  const isConfigured = !!env.VITE_VAPID_PUBLIC_KEY

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
    sendTestNotification,
    updatePreferences
  }
}
