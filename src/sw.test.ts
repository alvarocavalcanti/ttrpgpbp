import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn() }))

interface PushEventLike {
  data: { json: () => Record<string, unknown> }
  waitUntil: (p: Promise<unknown>) => void
}

let pushHandler: (event: PushEventLike) => void
let messageHandler: ((event: any) => void) | undefined
let notificationClickHandler: ((event: any) => void) | undefined

function dispatchPush(payload: Record<string, unknown>) {
  const waitUntil = vi.fn()
  pushHandler({ data: { json: () => payload }, waitUntil })
  return waitUntil
}

function dispatchMessage(payload: unknown) {
  const waitUntil = vi.fn((p: Promise<unknown>) => p)
  messageHandler?.({ data: payload, waitUntil })
  return waitUntil
}

function dispatchNotificationClick(data: unknown, clients: { url: string; focus?: ReturnType<typeof vi.fn> }[]) {
  const close = vi.fn()
  const waitUntil = vi.fn((p: Promise<unknown>) => p)
  const matchAll = vi.fn().mockResolvedValue(clients)
  Object.defineProperty(self, 'clients', { value: { matchAll, openWindow: vi.fn().mockResolvedValue(undefined) }, configurable: true })
  notificationClickHandler?.({ notification: { close, data }, waitUntil })
  return { close, waitUntil, matchAll }
}

describe('sw push handler badge', () => {
  let showNotification: ReturnType<typeof vi.fn>
  let setAppBadge: ReturnType<typeof vi.fn>
  let postMessage: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const origAdd = self.addEventListener.bind(self)
    const addEventListener = vi.fn(origAdd as unknown as (type: string, listener: unknown) => void)
    Object.defineProperty(self, 'addEventListener', { value: addEventListener, configurable: true })
    await import('./sw')
    const push = addEventListener.mock.calls.find(([type]) => type === 'push')
    if (!push) throw new Error('push listener not registered')
    pushHandler = push[1] as (event: PushEventLike) => void
    const message = addEventListener.mock.calls.find(([type]) => type === 'message')
    if (message) messageHandler = message[1] as (event: any) => void
    const click = addEventListener.mock.calls.find(([type]) => type === 'notificationclick')
    if (click) notificationClickHandler = click[1] as (event: any) => void
  })

  beforeEach(() => {
    vi.clearAllMocks()
    showNotification = vi.fn().mockResolvedValue(undefined)
    setAppBadge = vi.fn().mockResolvedValue(undefined)
    postMessage = vi.fn()
    Object.defineProperty(self, 'registration', {
      value: { showNotification },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(self.navigator, 'setAppBadge', {
      value: setAppBadge,
      configurable: true,
    })
    Object.defineProperty(self, 'clients', {
      value: { matchAll: vi.fn().mockResolvedValue([{ postMessage }]) },
      configurable: true,
    })
  })

  it('shows the notification for any payload', () => {
    dispatchPush({ title: 'Hi', body: 'there', url: '/channel/c1' })
    expect(showNotification).toHaveBeenCalledWith(
      'Hi',
      expect.objectContaining({ body: 'there', badge: '/favicon.svg' })
    )
  })

  it('notifies open tabs after handling a push', async () => {
    const waitUntil = dispatchPush({ title: 'Hi' })

    await waitUntil.mock.calls[0][0]

    expect(postMessage).toHaveBeenCalledWith({ type: 'PUSH_RECEIVED' })
  })

  it('sets the app badge when unreadCount present and badge enabled', () => {
    dispatchPush({ title: 'Hi', unreadCount: 3, badgeEnabled: true })
    expect(setAppBadge).toHaveBeenCalledWith(3)
  })

  it('does not set the badge when badge_enabled is false', () => {
    dispatchPush({ title: 'Hi', unreadCount: 3, badgeEnabled: false })
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('does not set the badge when unreadCount is missing', () => {
    dispatchPush({ title: 'Hi', badgeEnabled: true })
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('does not set the badge when the API is unsupported', () => {
    delete (self.navigator as unknown as Record<string, unknown>).setAppBadge
    const waitUntil = dispatchPush({ title: 'Hi', unreadCount: 3 })
    expect(setAppBadge).not.toHaveBeenCalled()
    expect(waitUntil).toHaveBeenCalled()
  })
})

describe('sw message handler closes channel notifications', () => {
  let getNotifications: ReturnType<typeof vi.fn>
  let close: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    close = vi.fn()
    getNotifications = vi.fn().mockResolvedValue([
      { data: { url: '/channel/c1' }, close },
      { data: { url: '/channel/c1/extra' }, close },
      { data: { url: '/channel/c10' }, close },
      { data: { url: '/channel/c2' }, close },
      { data: { url: '/' }, close },
    ])
    Object.defineProperty(self, 'registration', {
      value: { getNotifications },
      configurable: true,
      writable: true,
    })
  })

  it('closes only the notifications for the exact channel path', async () => {
    const waitUntil = dispatchMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId: 'c1' })
    await waitUntil.mock.calls[0][0]

    expect(getNotifications).toHaveBeenCalled()
    // Exact pathname match: /channel/c1 only, not /channel/c1/extra or /channel/c10.
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('ignores messages without a channelId', async () => {
    const waitUntil = dispatchMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS' })
    expect(waitUntil).not.toHaveBeenCalled()
    expect(getNotifications).not.toHaveBeenCalled()
  })

  it('ignores unrelated message types', async () => {
    const waitUntil = dispatchMessage({ type: 'SOMETHING_ELSE', channelId: 'c1' })
    expect(waitUntil).not.toHaveBeenCalled()
    expect(getNotifications).not.toHaveBeenCalled()
  })
})

describe('sw notificationclick focuses the exact channel', () => {
  it('focuses a client whose path matches the notification url', async () => {
    const focus = vi.fn()
    const { waitUntil } = dispatchNotificationClick({ url: '/channel/c1' }, [{ url: 'https://app.example/channel/c1', focus }])
    await waitUntil.mock.calls[0][0]
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('does not focus a client on a different-but-prefixed channel', async () => {
    const focus = vi.fn()
    const { waitUntil, matchAll } = dispatchNotificationClick({ url: '/channel/c1' }, [{ url: 'https://app.example/channel/c10', focus }])
    await waitUntil.mock.calls[0][0]
    expect(focus).not.toHaveBeenCalled()
    expect(matchAll).toHaveBeenCalled()
  })
})
