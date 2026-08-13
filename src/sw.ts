/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const title = data.title || 'RoleByPost'
    const options = {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/favicon.svg',
      data: {
        url: data.url || '/'
      }
    }
    
    const tasks: Promise<unknown>[] = [self.registration.showNotification(title, options)]

    // App icon badge count (iOS 16.4+, desktop). Respects the user's
    // badge_enabled preference carried in the push payload. Android has no
    // setAppBadge support — it shows an automatic dot while a notification is
    // active, so nothing to do there.
    if (data.badgeEnabled !== false && typeof data.unreadCount === 'number') {
      if ('setAppBadge' in self.navigator) {
        tasks.push(self.navigator.setAppBadge(data.unreadCount))
      }
    }

    event.waitUntil(Promise.all(tasks))
  } catch (err) {
    console.error('Error handling push event', err)
  }
})

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
