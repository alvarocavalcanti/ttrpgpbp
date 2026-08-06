import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PermissionBanner } from './PermissionBanner'
import { useAuth } from '../auth/useAuth'
import { usePushNotifications } from '../auth/usePushNotifications'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../auth/usePushNotifications', () => ({
  usePushNotifications: vi.fn()
}))

describe('PermissionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
  })

  it('renders nothing when not logged in', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('renders nothing when push not supported', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true,
      isSupported: false,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('renders nothing when not configured', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: false,
      isSupported: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('renders nothing when permission already granted', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'granted',
      isSubscribed: false,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('renders nothing when already subscribed', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'default',
      isSubscribed: true,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('renders banner when eligible', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    expect(screen.getByRole('region')).toBeInTheDocument()
  })

  it('enables notifications on click', async () => {
    const subscribeToPush = vi.fn().mockResolvedValue(undefined)
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush
    } as any)

    render(<PermissionBanner />)
    fireEvent.click(screen.getByText('Enable Notifications'))
    expect(subscribeToPush).toHaveBeenCalled()
  })

  it('dismisses banner on dismiss click', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn()
    } as any)

    render(<PermissionBanner />)
    fireEvent.click(screen.getByLabelText('Dismiss notification banner'))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('dismisses banner when subscription fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn().mockRejectedValue(new Error('Permission denied'))
    } as any)

    render(<PermissionBanner />)
    fireEvent.click(screen.getByText('Enable Notifications'))
    await waitFor(() => {
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
    })
  })
})
