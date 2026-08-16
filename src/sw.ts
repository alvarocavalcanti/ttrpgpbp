/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { handlePushEvent } from './lib/swPush'
import type { PushNotificationData } from './lib/swPush'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data: PushNotificationData
  try {
    data = event.data.json()
  } catch (err) {
    console.error('Invalid push payload', err)
    return
  }

  // handlePushEvent shows the notification and updates the badge with each
  // step isolated: a rejected setAppBadge never suppresses the tray
  // notification and never rejects the push event.
  event.waitUntil(
    handlePushEvent(
      { registration: self.registration, navigator: self.navigator, logger: console },
      data
    )
  )
})

// The browser rotates subscriptions (e.g. on expiry or key changes) without
// the page being involved. Relay the new subscription to an open tab so the
// authenticated page persists it; if no tab is open, the page reconciles the
// subscription on its next startup/foreground.
self.addEventListener('pushsubscriptionchange', ((event: ExtendableEvent) => {
  const subscription = (event as unknown as { newSubscription?: PushSubscription | null }).newSubscription ?? null

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: subscription ? subscription.toJSON() : null
          })
        }
      })
      .catch((err) => console.error('Error relaying push subscription change', err))
  )
}) as EventListener)

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url

  if (url) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
    )
  }
})

// The page asks us to dismiss a channel's system notifications once it has
// been read, so reading in the app clears the tray instead of leaving stale
// notifications behind.
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; channelId?: string }
  if (data?.type !== 'CLOSE_CHANNEL_NOTIFICATIONS' || !data.channelId) return

  event.waitUntil(
    self.registration.getNotifications().then((notifications) => {
      const channelUrl = `/channel/${data.channelId}`
      notifications
        .filter(n => n.data?.url?.includes(channelUrl))
        .forEach(n => n.close())
    })
  )
})
