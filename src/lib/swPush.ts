// Service-worker push handling, extracted from sw.ts so the failure-isolation
// rules are unit-testable (#191): a rejected or missing setAppBadge must never
// suppress the system-tray notification (or reject the push event).

import { z } from 'zod'

// A notification url is focused/opened by the service worker on click, and
// the payload is attacker-influenceable, so only site-relative paths are
// allowed (#429): exactly one leading '/', no '/' or '\' after it (which also
// rules out any scheme like javascript: or https://). WHATWG URL parsing maps
// '\' to '/' and strips tabs/newlines before resolution, so both are rejected
// up front — '/\evil.com' must not become a protocol-relative URL.
export function isSiteRelativeUrl(url: string): boolean {
  const normalized = url.replace(/[\t\n\r]/g, '')
  return /^\/(?![/\\])/.test(normalized)
}

export const PushNotificationDataSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  // '' is tolerated (the click handler ignores it — isSiteRelativeUrl('') is
  // false) because the push pipeline historically emits { url: '' }; rejecting
  // it at the schema boundary would drop the whole notification.
  url: z
    .string()
    .refine((url) => url === '' || isSiteRelativeUrl(url))
    .optional(),
  badgeEnabled: z.boolean().optional(),
// Badge counts must be valid non-negative safe integers: setAppBadge's
  // [EnforceRange] unsigned long long conversion throws synchronously on
  // negative, fractional, or oversized values, so reject them at the boundary.
  unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  // Receipt context: lets the worker report delivery milestones back to the
  // push-receipt function so a device-side drop is observable, not silent.
  eventId: z.string().optional(),
  eventKind: z.string().optional(),
  subscriptionId: z.string().optional(),
  ackToken: z.string().optional(),
  receiptUrl: z.string().optional()
})
// The subset of the payload needed to report a receipt. Pulled out leniently
// (independent of the strict schema) so even a payload that fails validation
// can report `invalid_payload` for the device that is failing.
export interface PushReceipt {
  eventId?: string
  eventKind?: string
  subscriptionId?: string
  ackToken?: string
  receiptUrl?: string
}

export type ReceiptStatus =
  | 'received'
  | 'invalid_payload'
  | 'shown'
  | 'show_error'
  | 'clicked'

type FetchLike = (input: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
  keepalive?: boolean
}) => Promise<unknown>

export interface PushHandlerScope {
  registration: {
    showNotification(title: string, options: NotificationOptions): Promise<void>
  }
  navigator: {
    setAppBadge?(count: number): Promise<void>
  }
  logger?: Pick<Console, 'error'>
  fetch?: FetchLike
}

const DEFAULT_TITLE = 'Role by Post'
const DEFAULT_ICON = '/pwa-192x192.png'
// Android's status-bar icon is the `badge`, and Android alpha-flattens it to a
// monochrome silhouette (it uses only the alpha channel, tinting every
// non-transparent pixel). The old multi-color SVG had an opaque full-bleed
// background, so it rendered as a solid square. This is a dedicated 96x96
// white-on-transparent PNG — SVG is not reliably rasterized for badges.
const DEFAULT_BADGE_ICON = '/notification-badge.png'

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// Leniently extracts the receipt context from a raw (possibly invalid) payload.
export function pushReceiptFrom(raw: unknown): PushReceipt {
  if (typeof raw !== 'object' || raw === null) return {}
  const source = raw as Record<string, unknown>
  return {
    eventId: asString(source.eventId),
    eventKind: asString(source.eventKind),
    subscriptionId: asString(source.subscriptionId),
    ackToken: asString(source.ackToken),
    receiptUrl: asString(source.receiptUrl)
  }
}

// Best-effort delivery receipt. Never throws and never blocks the push: a
// failed telemetry POST must not affect whether the notification is shown.
// Sent as a CORS "simple request" (no content-type header -> text/plain), so
// there is no preflight to block the beacon.
export async function reportPushReceipt(
  fetchFn: FetchLike,
  receipt: PushReceipt,
  status: ReceiptStatus,
  detail?: string
): Promise<void> {
  if (!receipt.receiptUrl || !receipt.subscriptionId || !receipt.ackToken) return
  try {
    await fetchFn(receipt.receiptUrl, {
      method: 'POST',
      body: JSON.stringify({
        subscription_id: receipt.subscriptionId,
        ack_token: receipt.ackToken,
        event_id: receipt.eventId ?? null,
        event_kind: receipt.eventKind ?? null,
        status,
        detail: detail ? detail.slice(0, 500) : null
      }),
      keepalive: true
    })
  } catch (err) {
    // Telemetry only — swallow.
    void err
  }
}

// Validates the raw push payload, shows the notification, updates the badge,
// and reports the outcome. Each async step is isolated so one failing step
// never rejects the whole push event. Resolves always. An invalid payload is
// dropped (and reported) rather than shown with bad data.
export async function handlePushEvent(scope: PushHandlerScope, raw: unknown): Promise<void> {
  const receipt = pushReceiptFrom(raw)
  const report = (status: ReceiptStatus, detail?: string) => {
    if (scope.fetch) void reportPushReceipt(scope.fetch, receipt, status, detail)
  }

  // Report receipt even for a payload we cannot parse: the device reaching us
  // at all is the important signal.
  report('received')

  const parsed = PushNotificationDataSchema.safeParse(raw)
  if (!parsed.success) {
    scope.logger?.error('Invalid push payload', parsed.error)
    report('invalid_payload', JSON.stringify(parsed.error.issues))
    return
  }
  const data = parsed.data

  const options: NotificationOptions = {
    body: data.body || '',
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE_ICON,
    // A stable tag collapses repeat pushes for the same target into one tray
    // entry (Android otherwise stacks an unbounded number of them).
    tag: data.url || '/',
    data: {
      url: data.url || '/',
      // Carried onto the notification so the click handler can report it.
      ...(receipt.receiptUrl ? { receipt } : {})
    }
  }

  const tasks: Promise<unknown>[] = [
    scope.registration.showNotification(data.title || DEFAULT_TITLE, options).then(
      () => report('shown'),
      (err) => {
        scope.logger?.error('Error showing push notification', err)
        report('show_error', err instanceof Error ? err.message : String(err))
      }
    )
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
