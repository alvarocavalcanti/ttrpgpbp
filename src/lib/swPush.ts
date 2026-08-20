// Service-worker push handling, extracted from sw.ts so the failure-isolation
// rules are unit-testable (#191): a rejected or missing setAppBadge must never
// suppress the system-tray notification (or reject the push event).

export interface PushNotificationData {
  title?: string
  body?: string
  url?: string
  badgeEnabled?: boolean
  unreadCount?: number
}

export interface PushHandlerScope {
  registration: {
    showNotification(title: string, options: NotificationOptions): Promise<void>
  }
  navigator: {
    setAppBadge?(count: number): Promise<void>
  }
  logger?: Pick<Console, 'error'>
}

const DEFAULT_TITLE = 'Role by Post'
const DEFAULT_ICON = '/pwa-192x192.png'
const DEFAULT_BADGE_ICON = '/favicon.svg'

// Shows the notification and updates the app badge, each guarded so one
// failing async step never rejects the whole push event. Resolves always.
export async function handlePushEvent(scope: PushHandlerScope, data: PushNotificationData): Promise<void> {
  const options: NotificationOptions = {
    body: data.body || '',
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE_ICON,
    data: { url: data.url || '/' }
  }

  const tasks: Promise<unknown>[] = [
    scope.registration.showNotification(data.title || DEFAULT_TITLE, options).catch((err) => {
      scope.logger?.error('Error showing push notification', err)
    })
  ]

  // Badge count (iOS 16.4+, desktop). Respects the user's badge_enabled
  // preference carried in the push payload. Android has no setAppBadge support
  // — it shows an automatic dot while a notification is active, so nothing to
  // do there. A badge failure is logged, never fatal.
  if (data.badgeEnabled !== false && typeof data.unreadCount === 'number' && scope.navigator.setAppBadge) {
    tasks.push(
      scope.navigator.setAppBadge(data.unreadCount).catch((err) => {
        scope.logger?.error('Error updating app badge from push', err)
      })
    )
  }

  await Promise.allSettled(tasks)
}
