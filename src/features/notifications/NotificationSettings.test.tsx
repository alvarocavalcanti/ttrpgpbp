import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationSettings } from './NotificationSettings'
import { usePushNotifications } from './usePushNotifications'
import { useToast } from '../../contexts/ToastContext'

vi.mock('./usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({
    addToast: vi.fn()
  })
}))

describe('NotificationSettings', () => {
  const mockUpdatePreferences = vi.fn()
  const mockSubscribe = vi.fn()
  const mockUnsubscribe = vi.fn()
  const mockSendTestNotification = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true, needsInstall: false,
      permission: 'granted',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      sendTestNotification: mockSendTestNotification,
      updatePreferences: mockUpdatePreferences
    })
  })

  function mockSubscribedDevice() {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true, needsInstall: false,
      permission: 'granted',
      isSubscribed: true,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      sendTestNotification: mockSendTestNotification,
      updatePreferences: mockUpdatePreferences
    })
  }

  it('allows toggling notification preferences', () => {
    render(<NotificationSettings />)

    fireEvent.click(screen.getByLabelText('Send me Push Notifications'))
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ push_enabled: false }) // since it was true

    fireEvent.click(screen.getByLabelText('Show App Icon Badge'))
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ badge_enabled: false })
  })

  it('allows subscribing and unsubscribing from push', () => {
    const { rerender } = render(<NotificationSettings />)

    // Initially isSubscribed is false
    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))
    expect(mockSubscribe).toHaveBeenCalled()

    // Rerender with isSubscribed = true
    mockSubscribedDevice()
    rerender(<NotificationSettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('shows a toast when the push toggle fails', async () => {
    mockSubscribe.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<NotificationSettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Failed to update push notification settings. Please try again.', 'error')
    })
  })

  it('shows a test notification from settings', async () => {
    mockSubscribedDevice()
    mockSendTestNotification.mockResolvedValue(undefined)

    render(<NotificationSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Send test notification' }))

    await waitFor(() => expect(mockSendTestNotification).toHaveBeenCalled())
    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith(
        'Test notification sent — check your notification shade.',
        'success'
      )
    })
  })

  it('shows the reason when a test notification cannot be shown', async () => {
    mockSubscribedDevice()
    mockSendTestNotification.mockRejectedValue(new Error('Notifications are blocked for this app on this device.'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<NotificationSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Send test notification' }))

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith(
        'Notifications are blocked for this app on this device.',
        'error'
      )
    })
  })

  it('does not offer a test notification before the device is subscribed', () => {
    render(<NotificationSettings />)

    expect(screen.queryByRole('button', { name: 'Send test notification' })).toBeNull()
  })

  it('explains the Android app permission only for an installed Android app', () => {
    mockSubscribedDevice()
    const originalMatchMedia = window.matchMedia
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as any

    const { unmount } = render(<NotificationSettings />)
    expect(screen.getByText(/Settings → Apps → RoleByPost/)).toBeInTheDocument()

    unmount()
    vi.unstubAllGlobals()
    window.matchMedia = originalMatchMedia

    render(<NotificationSettings />)
    expect(screen.queryByText(/Settings → Apps → RoleByPost/)).toBeNull()
  })

  it('shows not configured message when isConfigured is false', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: false,
      isSupported: true,
      needsInstall: false,
      permission: 'granted',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      sendTestNotification: mockSendTestNotification,
      updatePreferences: mockUpdatePreferences
    })

    render(<NotificationSettings />)
    expect(screen.getByText('Push notifications are not configured on the server.')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Use push notifications' })).not.toBeInTheDocument()
  })

  it('disables the push checkbox when push is unavailable and keeps badges enabled', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: false, needsInstall: false,
      permission: 'default',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      sendTestNotification: mockSendTestNotification,
      updatePreferences: mockUpdatePreferences
    })

    render(<NotificationSettings />)

    expect(screen.getByLabelText('Send me Push Notifications')).toBeDisabled()
    expect(screen.getByLabelText('Show App Icon Badge')).toBeEnabled()
  })

  it('shows iOS install message when needsInstall is true', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: false, needsInstall: true,
      permission: 'default',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      sendTestNotification: mockSendTestNotification,
      updatePreferences: mockUpdatePreferences
    })

    render(<NotificationSettings />)

    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.getByLabelText('Send me Push Notifications')).toBeDisabled()
  })

  it('shows the loading skeleton until preferences arrive', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true, needsInstall: false,
      permission: 'granted',
      isSubscribed: false,
      preferences: null,
      loading: true,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      sendTestNotification: mockSendTestNotification,
      updatePreferences: mockUpdatePreferences
    })

    const { container } = render(<NotificationSettings />)

    expect(screen.queryByLabelText('Send me Push Notifications')).toBeNull()
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
