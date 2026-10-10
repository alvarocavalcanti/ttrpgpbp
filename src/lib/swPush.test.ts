import { describe, it, expect, vi } from 'vitest'
import { handlePushEvent, isSiteRelativeUrl, PushNotificationDataSchema, pushReceiptFrom, reportPushReceipt } from './swPush'

function makeScope(overrides: Partial<Parameters<typeof handlePushEvent>[0]> = {}) {
  const logger = { error: vi.fn() }
  const registration = {
    showNotification: vi.fn().mockResolvedValue(undefined)
  }
  const navigator = {
    setAppBadge: vi.fn().mockResolvedValue(undefined)
  }
  const fetch = vi.fn().mockResolvedValue({ ok: true })
  const scope = { registration, navigator, logger, fetch, ...overrides }
  return { scope, registration, navigator, logger, fetch }
}

describe('PushNotificationDataSchema', () => {
  it('accepts an optional valid unread count', () => {
    expect(PushNotificationDataSchema.safeParse({ unreadCount: 0 }).success).toBe(true)
    expect(PushNotificationDataSchema.safeParse({ unreadCount: Number.MAX_SAFE_INTEGER }).success).toBe(true)
    expect(PushNotificationDataSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a negative unread count', () => {
    expect(PushNotificationDataSchema.safeParse({ unreadCount: -1 }).success).toBe(false)
  })

  it('rejects a fractional unread count', () => {
    expect(PushNotificationDataSchema.safeParse({ unreadCount: 1.5 }).success).toBe(false)
  })

  it('rejects an oversized unread count', () => {
    expect(PushNotificationDataSchema.safeParse({ unreadCount: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false)
  })

  it('accepts site-relative urls', () => {
    expect(PushNotificationDataSchema.safeParse({ url: '/channel/x' }).success).toBe(true)
    expect(PushNotificationDataSchema.safeParse({ url: '/' }).success).toBe(true)
  })

  it('tolerates an empty url (historical pipeline emits { url: "" })', () => {
    expect(PushNotificationDataSchema.safeParse({ url: '' }).success).toBe(true)
  })

  it('rejects urls that are not site-relative', () => {
    expect(PushNotificationDataSchema.safeParse({ url: 'https://evil.com' }).success).toBe(false)
    expect(PushNotificationDataSchema.safeParse({ url: '//evil.com' }).success).toBe(false)
    expect(PushNotificationDataSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
    expect(PushNotificationDataSchema.safeParse({ url: 'relative-no-slash' }).success).toBe(false)
  })

  it('rejects WHATWG parser tricks that resolve off-origin', () => {
    // '\' normalizes to '/' during URL parsing, so '/\evil.com' becomes a
    // protocol-relative URL; tabs/newlines are stripped before resolution,
    // so '/\t/evil.com' would too if the check ran on the raw string.
    expect(isSiteRelativeUrl('/\\evil.com')).toBe(false)
    expect(isSiteRelativeUrl('/\t/evil.com')).toBe(false)
    // Stripping the tab leaves a plain relative path: safe.
    expect(isSiteRelativeUrl('/\tevil.com')).toBe(true)
  })
})

describe('handlePushEvent', () => {
  it('shows a notification with defaults when no title is given', async () => {
    const { scope, registration } = makeScope()
    await handlePushEvent(scope, {})
    expect(registration.showNotification).toHaveBeenCalledWith(
      'Role by Post',
      expect.objectContaining({
        body: '',
        icon: '/pwa-192x192.png',
        badge: '/notification-badge.png',
        data: { url: '/' },
      })
    )
  })

  it('uses the payload title, body and url', async () => {
    const { scope, registration } = makeScope()
    await handlePushEvent(scope, { title: 'New message', body: 'hello', url: '/channel/c1' })
    expect(registration.showNotification).toHaveBeenCalledWith(
      'New message',
      expect.objectContaining({ body: 'hello', data: { url: '/channel/c1' } })
    )
  })

  it('updates the app badge when badge is enabled and unread count is present', async () => {
    const { scope, navigator } = makeScope()
    await handlePushEvent(scope, { badgeEnabled: true, unreadCount: 4 })
    expect(navigator.setAppBadge).toHaveBeenCalledWith(4)
  })

  it('skips the badge when setAppBadge is not supported', async () => {
    const { scope, navigator } = makeScope({ navigator: {} })
    await handlePushEvent(scope, { badgeEnabled: true, unreadCount: 4 })
    expect(navigator.setAppBadge).not.toHaveBeenCalled()
  })

  it('skips the badge when badge is disabled by preference', async () => {
    const { scope, navigator } = makeScope()
    await handlePushEvent(scope, { badgeEnabled: false, unreadCount: 4 })
    expect(navigator.setAppBadge).not.toHaveBeenCalled()
  })

  it('skips the badge when unread count is missing', async () => {
    const { scope, navigator } = makeScope()
    await handlePushEvent(scope, { badgeEnabled: true })
    expect(navigator.setAppBadge).not.toHaveBeenCalled()
  })

  it('still shows the notification when the badge update rejects', async () => {
    const { scope, registration, navigator, logger } = makeScope()
    navigator.setAppBadge.mockRejectedValue(new Error('NotSupportedError'))

    await expect(handlePushEvent(scope, { badgeEnabled: true, unreadCount: 4 })).resolves.toBeUndefined()

    expect(registration.showNotification).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith('Error updating app badge from push', expect.any(Error))
  })

  it('resolves when showNotification rejects and logs the failure', async () => {
    const { scope, registration, logger } = makeScope()
    registration.showNotification.mockRejectedValue(new Error('show failed'))

    await expect(handlePushEvent(scope, { title: 'T' })).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith('Error showing push notification', expect.any(Error))
  })

  it('still updates the badge when showNotification rejects', async () => {
    const { scope, registration, navigator } = makeScope()
    registration.showNotification.mockRejectedValue(new Error('show failed'))

    await handlePushEvent(scope, { badgeEnabled: true, unreadCount: 2 })
    expect(navigator.setAppBadge).toHaveBeenCalledWith(2)
  })

  it('tags the notification so repeat pushes collapse', async () => {
    const { scope, registration } = makeScope()
    await handlePushEvent(scope, { title: 'T', url: '/channel/c1' })
    expect(registration.showNotification).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ tag: '/channel/c1' })
    )
  })

  it('reports received then shown when a receipt context is present', async () => {
    const { scope, fetch } = makeScope()
    await handlePushEvent(scope, {
      title: 'T',
      eventId: 'e1',
      eventKind: 'message',
      subscriptionId: 's1',
      ackToken: 't1',
      receiptUrl: 'https://fn.example/push-receipt'
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][0]).toBe('https://fn.example/push-receipt')
    const statuses = fetch.mock.calls.map(call => JSON.parse(call[1].body).status)
    expect(statuses).toEqual(['received', 'shown'])
  })

  it('does not report when the payload carries no receipt context', async () => {
    const { scope, fetch } = makeScope()
    await handlePushEvent(scope, { title: 'T' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('drops an invalid payload without showing, and reports it', async () => {
    const { scope, registration, fetch } = makeScope()
    await handlePushEvent(scope, {
      url: 'https://evil.com',
      subscriptionId: 's1',
      ackToken: 't1',
      receiptUrl: 'https://fn.example/push-receipt'
    })

    expect(registration.showNotification).not.toHaveBeenCalled()
    const statuses = fetch.mock.calls.map(call => JSON.parse(call[1].body).status)
    expect(statuses).toEqual(['received', 'invalid_payload'])
  })

  it('reports show_error with the failure message', async () => {
    const { scope, registration, fetch } = makeScope()
    registration.showNotification.mockRejectedValue(new Error('display blocked'))

    await handlePushEvent(scope, {
      title: 'T',
      subscriptionId: 's1',
      ackToken: 't1',
      receiptUrl: 'https://fn.example/push-receipt'
    })

    const errorCall = fetch.mock.calls.find(call => JSON.parse(call[1].body).status === 'show_error')
    expect(errorCall).toBeDefined()
    expect(JSON.parse(errorCall![1].body).detail).toBe('display blocked')
  })
})

describe('pushReceiptFrom', () => {
  it('extracts the receipt context from a raw object', () => {
    expect(pushReceiptFrom({
      eventId: 'e1',
      eventKind: 'message',
      subscriptionId: 's1',
      ackToken: 't1',
      receiptUrl: 'https://fn'
    })).toEqual({ eventId: 'e1', eventKind: 'message', subscriptionId: 's1', ackToken: 't1', receiptUrl: 'https://fn' })
  })

  it('returns an empty object for non-objects and drops non-strings', () => {
    expect(pushReceiptFrom(null)).toEqual({})
    expect(pushReceiptFrom('nope')).toEqual({})
    expect(pushReceiptFrom({ subscriptionId: 42, ackToken: '' })).toEqual({})
  })
})

describe('reportPushReceipt', () => {
  it('no-ops when the receipt context is incomplete', async () => {
    const fetch = vi.fn()
    await reportPushReceipt(fetch, { subscriptionId: 's1' }, 'shown')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the milestone with the ack token', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    await reportPushReceipt(
      fetch,
      { eventId: 'e1', eventKind: 'message', subscriptionId: 's1', ackToken: 't1', receiptUrl: 'https://fn' },
      'shown'
    )
    expect(fetch).toHaveBeenCalledWith('https://fn', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      subscription_id: 's1', ack_token: 't1', event_id: 'e1', status: 'shown'
    })
  })

  it('swallows a rejected telemetry POST', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(reportPushReceipt(
      fetch,
      { subscriptionId: 's1', ackToken: 't1', receiptUrl: 'https://fn' },
      'received'
    )).resolves.toBeUndefined()
  })
})
