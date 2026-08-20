import { describe, it, expect, vi } from 'vitest'
import { handlePushEvent } from './swPush'

function makeScope(overrides: Partial<Parameters<typeof handlePushEvent>[0]> = {}) {
  const logger = { error: vi.fn() }
  const registration = {
    showNotification: vi.fn().mockResolvedValue(undefined)
  }
  const navigator = {
    setAppBadge: vi.fn().mockResolvedValue(undefined)
  }
  const scope = { registration, navigator, logger, ...overrides }
  return { scope, registration, navigator, logger }
}

describe('handlePushEvent', () => {
  it('shows a notification with defaults when no title is given', async () => {
    const { scope, registration } = makeScope()
    await handlePushEvent(scope, {})
    expect(registration.showNotification).toHaveBeenCalledWith(
      'Role by Post',
      expect.objectContaining({ body: '', icon: '/pwa-192x192.png', data: { url: '/' } })
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
})
