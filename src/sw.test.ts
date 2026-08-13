import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn() }))

interface PushEventLike {
  data: { json: () => Record<string, unknown> }
  waitUntil: (p: Promise<unknown>) => void
}

let pushHandler: (event: PushEventLike) => void

function dispatchPush(payload: Record<string, unknown>) {
  const waitUntil = vi.fn()
  pushHandler({ data: { json: () => payload }, waitUntil })
  return waitUntil
}

describe('sw push handler badge', () => {
  let showNotification: ReturnType<typeof vi.fn>
  let setAppBadge: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const origAdd = self.addEventListener.bind(self)
    const addEventListener = vi.fn(origAdd as unknown as (type: string, listener: unknown) => void)
    Object.defineProperty(self, 'addEventListener', { value: addEventListener, configurable: true })
    await import('./sw')
    const push = addEventListener.mock.calls.find(([type]) => type === 'push')
    if (!push) throw new Error('push listener not registered')
    pushHandler = push[1] as (event: PushEventLike) => void
  })

  beforeEach(() => {
    vi.clearAllMocks()
    showNotification = vi.fn().mockResolvedValue(undefined)
    setAppBadge = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(self, 'registration', {
      value: { showNotification },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(self.navigator, 'setAppBadge', {
      value: setAppBadge,
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
