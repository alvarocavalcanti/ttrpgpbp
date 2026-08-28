import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn() }))

interface PushEventLike {
  data: { json: () => Record<string, unknown> } | null
  waitUntil: (p: Promise<unknown>) => void
}

let pushHandler: (event: PushEventLike) => void
let messageHandler: ((event: any) => void) | undefined

function dispatchPush(payload: Record<string, unknown> | null, jsonImpl?: () => Record<string, unknown>) {
  const waitUntil = vi.fn()
  const data = payload === null
    ? null
    : { json: jsonImpl ?? (() => payload) }
  pushHandler({ data, waitUntil })
  return waitUntil
}

function dispatchMessage(payload: unknown) {
  const waitUntil = vi.fn((p: Promise<unknown>) => p)
  messageHandler?.({ data: payload, waitUntil })
  return waitUntil
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

  it('ignores a push event with null data', () => {
    const waitUntil = dispatchPush(null)
    expect(showNotification).not.toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('ignores a push event whose data.json() throws', () => {
    const waitUntil = dispatchPush(null as never, () => { throw new Error('bad json') })
    expect(showNotification).not.toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
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
      { data: { url: '/channel/c2' }, close },
      { data: { url: '/' }, close },
    ])
    Object.defineProperty(self, 'registration', {
      value: { getNotifications },
      configurable: true,
      writable: true,
    })
  })

  it('closes only the notifications for the given channel', async () => {
    const waitUntil = dispatchMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId: 'c1' })
    await waitUntil.mock.calls[0][0]

    expect(getNotifications).toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(2)
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
