import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { registerRoute, createHandlerBoundToURL, NavigationRoute } = vi.hoisted(() => {
  const registerRoute = vi.fn()
  const createHandlerBoundToURL = vi.fn().mockReturnValue('index-handler')
  class NavigationRoute {
    handler: unknown
    constructor(handler: unknown) {
      this.handler = handler
    }
  }
  return { registerRoute, createHandlerBoundToURL, NavigationRoute }
})

vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
  createHandlerBoundToURL,
}))
vi.mock('workbox-routing', () => ({ NavigationRoute, registerRoute }))

interface PushEventLike {
  data: { json: () => Record<string, unknown> } | null
  waitUntil: (p: Promise<unknown>) => void
}

let pushHandler: (event: PushEventLike) => void
let messageHandler: ((event: any) => void) | undefined
let notificationClickHandler: ((event: any) => void) | undefined
let activateHandler: ((event: any) => void) | undefined

beforeAll(async () => {
  const origAdd = self.addEventListener.bind(self)
  const addEventListener = vi.fn(origAdd as unknown as (type: string, listener: unknown) => void)
  Object.defineProperty(self, 'addEventListener', { value: addEventListener, configurable: true })
  await import('./sw')
  const find = (type: string) => addEventListener.mock.calls.find(([t]) => t === type)?.[1]
  pushHandler = find('push') as (event: PushEventLike) => void
  messageHandler = find('message') as ((event: any) => void) | undefined
  notificationClickHandler = find('notificationclick') as ((event: any) => void) | undefined
  activateHandler = find('activate') as ((event: any) => void) | undefined
})

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

function dispatchNotificationClick(data: unknown, clients: { url: string; focus?: ReturnType<typeof vi.fn> }[]) {
  const close = vi.fn()
  const waitUntil = vi.fn((p: Promise<unknown>) => p)
  const matchAll = vi.fn().mockResolvedValue(clients)
  const openWindow = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(self, 'clients', { value: { matchAll, openWindow }, configurable: true })
  notificationClickHandler?.({ notification: { close, data }, waitUntil })
  return { close, waitUntil, matchAll, openWindow }
}

describe('sw navigation fallback', () => {
  it('serves the pre-cached app shell for every navigation', async () => {
    await import('./sw')
    expect(registerRoute).toHaveBeenCalledTimes(1)
    const route = registerRoute.mock.calls[0][0]
    expect(route).toBeInstanceOf(NavigationRoute)
    expect(route.handler).toBe('index-handler')
    expect(createHandlerBoundToURL).toHaveBeenCalledWith('index.html')
  })
})

describe('sw push handler badge', () => {
  let showNotification: ReturnType<typeof vi.fn>
  let setAppBadge: ReturnType<typeof vi.fn>
  let postMessage: ReturnType<typeof vi.fn>

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

  it('does not close notifications with a malformed url', async () => {
    getNotifications.mockResolvedValue([{ data: { url: 'http://[bad' }, close }])
    const waitUntil = dispatchMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId: 'c1' })
    await waitUntil.mock.calls[0][0]

    expect(close).not.toHaveBeenCalled()
  })
})

describe('sw message handler skips waiting on update prompt', () => {
  let skipWaiting: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    skipWaiting = vi.fn()
    Object.defineProperty(self, 'skipWaiting', {
      value: skipWaiting,
      configurable: true,
    })
  })

  it('calls skipWaiting when the page taps the update CTA', () => {
    const waitUntil = dispatchMessage({ type: 'SKIP_WAITING' })
    expect(skipWaiting).toHaveBeenCalledTimes(1)
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('ignores other message types without skipping', () => {
    dispatchMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId: 'c1' })
    expect(skipWaiting).not.toHaveBeenCalled()
  })
})

describe('sw activate handler claims clients', () => {
  let claim: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    claim = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(self, 'clients', {
      value: { claim },
      configurable: true,
    })
  })

  it('calls clients.claim() on activation so the new worker controls the page', () => {
    const waitUntil = vi.fn()
    activateHandler?.({ waitUntil })
    expect(claim).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledWith(claim.mock.results[0].value)
  })
})

describe('sw notificationclick focuses the exact channel', () => {
  it('focuses a client whose path matches the notification url', async () => {
    const focus = vi.fn()
    const { waitUntil, openWindow } = dispatchNotificationClick({ url: '/channel/c1' }, [{ url: 'https://app.example/channel/c1', focus }])
    await waitUntil.mock.calls[0][0]
    expect(focus).toHaveBeenCalledTimes(1)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('does not focus a client on a different-but-prefixed channel and falls back to openWindow', async () => {
    const focus = vi.fn()
    const { waitUntil, matchAll, openWindow } = dispatchNotificationClick({ url: '/channel/c1' }, [{ url: 'https://app.example/channel/c10', focus }])
    await waitUntil.mock.calls[0][0]
    expect(focus).not.toHaveBeenCalled()
    expect(matchAll).toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/channel/c1')
  })

  it('gracefully handles a malformed notification url', async () => {
    const focus = vi.fn()
    const { waitUntil, openWindow } = dispatchNotificationClick({ url: 'http://[bad' }, [{ url: 'https://app.example/channel/c1', focus }])
    await waitUntil.mock.calls[0][0]
    expect(focus).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('http://[bad')
  })
})
