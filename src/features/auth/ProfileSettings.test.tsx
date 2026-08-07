import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileSettings } from './ProfileSettings'
import { useAuth } from './useAuth'
import { usePushNotifications } from './usePushNotifications'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('./usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({
    addToast: vi.fn()
  })
}))

describe('ProfileSettings', () => {
  const mockUpdatePreferences = vi.fn()
  const mockSubscribe = vi.fn()
  const mockUnsubscribe = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'granted',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      updatePreferences: mockUpdatePreferences
    })
  })

  it('renders nothing if profile is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: null,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    const { container } = render(<ProfileSettings />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders profile form with pre-filled values', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        email: 'user@example.com',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '',
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    render(<ProfileSettings />)

    expect(screen.getByDisplayValue('Test Player')).toBeInTheDocument()
    expect(screen.getByDisplayValue('user@example.com')).toBeDisabled()
    expect(screen.getByRole('img', { name: 'Avatar' })).toHaveAttribute('src', 'https://example.com/avatar.jpg')
  })

  it('updates display name on submit and shows success message', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        email: 'user@example.com',
        avatar_url: null,
        created_at: '',
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<ProfileSettings />)

    const input = screen.getByLabelText('Display Name')
    fireEvent.change(input, { target: { value: 'New Name' } })

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    fireEvent.click(saveButton)

    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'New Name' })
    expect(mockEq).toHaveBeenCalledWith('id', '123')

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Profile updated successfully.', 'success')
    })
  })

  it('shows error message on update failure', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        email: 'user@example.com',
        avatar_url: null,
        created_at: '',
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    const mockEq = vi.fn().mockResolvedValue({ error: new Error('Database error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<ProfileSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Failed to update profile. Please try again.', 'error')
    })
  })

  it('allows toggling notification preferences', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: { id: '123', display_name: 'Test Player' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    render(<ProfileSettings />)

    fireEvent.click(screen.getByLabelText('Send me Push Notifications'))
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ push_enabled: false }) // since it was true

    fireEvent.click(screen.getByLabelText('Show Unread Badges'))
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ badge_enabled: false })
  })

  it('allows subscribing and unsubscribing from push', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: { id: '123', display_name: 'Test Player' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    const { rerender } = render(<ProfileSettings />)

    // Initially isSubscribed is false
    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))
    expect(mockSubscribe).toHaveBeenCalled()

    // Rerender with isSubscribed = true
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true,
      permission: 'granted',
      isSubscribed: true,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      updatePreferences: mockUpdatePreferences
    })

    rerender(<ProfileSettings />)
    
    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('shows not configured message when isConfigured is false', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: false,
      isSupported: true,
      permission: 'granted',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      updatePreferences: mockUpdatePreferences
    })

    render(<ProfileSettings />)
    expect(screen.getByText('Push notifications are not configured on the server.')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Use push notifications' })).not.toBeInTheDocument()
  })
})
