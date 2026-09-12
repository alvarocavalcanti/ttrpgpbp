/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { handlePushEvent } from './lib/swPush'
import { PushNotificationDataSchema, isSiteRelativeUrl } from './lib/swPush'
import type { PushNotificationData } from './lib/swPush'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST || [])

// Set when the update prompt's CTA is tapped (the page posts SKIP_WAITING), so
// activate can distinguish an update from a first install. On first install no
// SKIP_WAITING is ever sent, so this stays false and clients are only claimed,
// never reloaded.
let skipWaitingRequested = false

// Take control of the page as soon as this worker activates. Without
// clients.claim() the updated worker skips waiting and activates, but the open
// page stays under the old worker — workbox-window's `controlling` event (which
// triggers the update prompt's reload) would never fire (issue #385).
//
// On an update (issue #507) also reload every open window from here: Android
// Chrome can drop the page-side `controllerchange` event, so the reload must be
// driven by the worker itself. Navigating after claim guarantees the reload
// runs under this (new) worker and serves the fresh pre-cached shell instead of
// the stale one.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    if (!skipWaitingRequested) return
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    await Promise.all(clients.map((client) => {
      const win = client as WindowClient
      // `navigate` is Chrome/Firefox-only; Safari lacks it, so the page-side
      // `controllerchange`/fallback reload is what updates those clients.
      if (typeof win.navigate !== 'function') return
      return win.navigate(win.url).catch(() => {})
    }))
  })())
})

// SPA navigation fallback: deep links like /channel/:id serve the pre-cached
// app shell when offline instead of a browser error page (#336). The shell
// itself renders its own empty/error states for unreachable data.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Exact pathname comparison (not substring) so `/channel/c1` can never match
// `/channel/c10`. Both sides are resolved against the worker origin so a
// relative push url like `/channel/c1` compares against the client's absolute
// `location.href`.
function matchesPath(url: string, target: string): boolean {
  try {
    const base = self.location.origin
    return new URL(url, base).pathname === new URL(target, base).pathname
  } catch {
    return false
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data: PushNotificationData
  try {
    const parsed = PushNotificationDataSchema.safeParse(event.data.json())
    if (!parsed.success) {
      console.error('Invalid push payload', parsed.error)
      return
    }
    data = parsed.data
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
      .then(async () => {
        if (!self.clients?.matchAll) return
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clients) client.postMessage({ type: 'PUSH_RECEIVED' })
      })
      .catch((err) => console.error('Error notifying open tabs about push', err))
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

  // Notification data travels with the push payload and may be crafted
  // outside the schema's parse (e.g. an old notification), so re-check here:
  // only site-relative url STRINGS may be focused or opened (#429). The
  // typeof guard also keeps a truthy non-string url (number, object…) from
  // reaching the validator and throwing.
  if (typeof url === 'string' && url && isSiteRelativeUrl(url)) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (matchesPath(client.url, url) && 'focus' in client) {
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

  // The page asked us to take over when the user chose to update (issue #385):
  // workbox-window's messageSkipWaiting() sends this after the "New version
  // available" prompt's CTA is tapped, and without skipWaiting the new worker
  // stays in the waiting state forever — the cached old shell keeps serving.
  if (data?.type === 'SKIP_WAITING') {
    skipWaitingRequested = true
    self.skipWaiting()
    return
  }

  if (data?.type !== 'CLOSE_CHANNEL_NOTIFICATIONS' || !data.channelId) return

  event.waitUntil(
    self.registration.getNotifications().then((notifications) => {
      const channelUrl = `/channel/${data.channelId}`
      notifications
        .filter(n => typeof n.data?.url === 'string' && matchesPath(n.data.url, channelUrl))
        .forEach(n => n.close())
    })
  )
})
