import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileSettings } from './ProfileSettings'
import { useAuth } from './useAuth'
import { useProfileAvatar } from './useProfileAvatar'
import { usePushNotifications } from '../notifications/usePushNotifications'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { buildUserDataExport, downloadJson } from './exportUserData'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../notifications/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

vi.mock('./useProfileAvatar', () => ({
  useProfileAvatar: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    storage: {
      from: vi.fn(),
    },
  },
}))

vi.mock('./exportUserData', () => ({
  buildUserDataExport: vi.fn(),
  downloadJson: vi.fn(),
}))

const mockEnv = vi.hoisted(() => ({ VITE_GA_MEASUREMENT_ID: 'G-TEST' }))
vi.mock('../../env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../env')>()
  return { env: { ...actual.env, VITE_GA_MEASUREMENT_ID: mockEnv.VITE_GA_MEASUREMENT_ID } }
})

const initAnalytics = vi.hoisted(() => vi.fn())
const trackPageView = vi.hoisted(() => vi.fn())
const disableAnalytics = vi.hoisted(() => vi.fn())
vi.mock('../../lib/analytics', () => ({ initAnalytics, trackPageView, disableAnalytics }))

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
    window.localStorage.clear()
    window.sessionStorage.clear()

    vi.mocked(supabase.storage.from).mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/profile.jpg' }, error: null }),
    } as any)
    vi.mocked(useProfileAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: vi.fn(),
    })
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true, needsInstall: false,
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

  function renderWithRouter(ui: ReactElement) {
    return render(<MemoryRouter>{ui}</MemoryRouter>)
  }

  it('renders nothing if profile is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: null,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const { container } = renderWithRouter(<ProfileSettings />)
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
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    expect(screen.getByDisplayValue('Test Player')).toBeInTheDocument()
    expect(screen.getByLabelText('Display Name')).toHaveAttribute('maxLength', '40')
    expect(screen.getByDisplayValue('user@example.com')).toBeDisabled()
    expect(screen.getByRole('img', { name: 'Avatar' })).toHaveAttribute('src', 'https://example.com/avatar.jpg')
  })

  it('describes uploaded, Google, and missing avatars truthfully', () => {
    const googleUrl = 'https://lh3.googleusercontent.com/photo.jpg'
    const uploadedPath = '123e4567-e89b-12d3-a456-426614174000/profile/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'
    const cases = [
      { avatar: uploadedPath, description: 'Using your uploaded picture.', googleAction: true },
      { avatar: googleUrl, description: 'Currently using your Google account picture.', googleAction: false },
      { avatar: null, description: 'No picture yet — showing your initial.', googleAction: true },
    ]

    for (const testCase of cases) {
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        error: null,
        user: { id: '123', email: 'user@example.com', user_metadata: { avatar_url: googleUrl } } as any,
        profile: {
          id: '123',
          display_name: 'Test Player',
          avatar_url: testCase.avatar,
          created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
        },
        session: null,

        signInWithGoogle: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      const { unmount } = renderWithRouter(<ProfileSettings />)
      expect(screen.getByText(testCase.description)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Use Google picture' }) !== null).toBe(testCase.googleAction)
      unmount()
    }
  })

  it('uploads a profile picture from the avatar control', async () => {
    const mockRefreshProfile = vi.fn()
    const mockUploadAvatar = vi.fn().mockResolvedValue('123/profile/avatar.jpg')
    vi.mocked(useProfileAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: mockUploadAvatar,
    })
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: mockRefreshProfile,
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    const file = new File(['picture'], 'photo.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockUploadAvatar).toHaveBeenCalledWith(file)
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Profile picture updated.', 'success')
    })
  })

  it('shows upload errors from the avatar control', async () => {
    const mockUploadAvatar = vi.fn().mockRejectedValue(new Error('Image is too large (max 5 MB)'))
    vi.mocked(useProfileAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: mockUploadAvatar,
    })
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['picture'], 'photo.png', { type: 'image/png' })] },
    })

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Image is too large (max 5 MB)', 'error')
    })
  })

  it('disables the avatar control when uploads are turned off', () => {
    vi.mocked(useProfileAvatar).mockReturnValue({
      uploadEnabled: false,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: vi.fn(),
    })
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    expect(screen.getByRole('button', { name: 'Change profile picture' })).toBeDisabled()
    expect(screen.getByText('Image uploads are turned off by the server admin.')).toBeInTheDocument()
  })

  it('disables the avatar control while settings and uploads are pending', () => {
    vi.mocked(useProfileAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: true,
      uploading: true,
      uploadAvatar: vi.fn(),
    })
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    expect(screen.getByRole('button', { name: 'Change profile picture' })).toBeDisabled()
    expect(screen.getByText('Checking upload availability.')).toBeInTheDocument()
  })

  it('restores the Google picture when the revert action succeeds', async () => {
    const googleUrl = 'https://lh3.googleusercontent.com/photo.jpg'
    const mockRefreshProfile = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com', user_metadata: { avatar_url: googleUrl } } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: '123/profile/old.jpg',
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: mockRefreshProfile,
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    renderWithRouter(<ProfileSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Use Google picture' }))

    expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: googleUrl })
    expect(mockEq).toHaveBeenCalledWith('id', '123')
    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalled()
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Profile picture updated.', 'success')
    })
  })

  it('shows an error when restoring the Google picture fails', async () => {
    const googleUrl = 'https://lh3.googleusercontent.com/photo.jpg'
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com', user_metadata: { avatar_url: googleUrl } } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: '123/profile/old.jpg',
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const mockEq = vi.fn().mockResolvedValue({ error: new Error('Database error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    renderWithRouter(<ProfileSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Use Google picture' }))

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Failed to restore your Google picture. Please try again.', 'error')
    })
  })

  it('lets the player turn usage analytics on and off from settings', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    const checkbox = screen.getByLabelText('Allow usage analytics')
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    expect(initAnalytics).toHaveBeenCalled()
    expect(localStorage.getItem('analytics-consent')).toBe('granted')

    fireEvent.click(checkbox)
    expect(disableAnalytics).toHaveBeenCalled()
    expect(localStorage.getItem('analytics-consent')).toBe('denied')
  })

  it('updates display name on submit and shows success message', async () => {
    const mockRefreshProfile = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: {
        id: '123',
        display_name: 'Test Player',
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: mockRefreshProfile,
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    renderWithRouter(<ProfileSettings />)

    const input = screen.getByLabelText('Display Name')
    fireEvent.change(input, { target: { value: 'New Name' } })

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    fireEvent.click(saveButton)

    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'New Name' })
    expect(mockEq).toHaveBeenCalledWith('id', '123')

    await waitFor(() => {
      // Context profile is re-synced after a successful save (ARCH-4).
      expect(mockRefreshProfile).toHaveBeenCalled()
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
        avatar_url: null,
        created_at: '', is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null,
      },
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const mockEq = vi.fn().mockResolvedValue({ error: new Error('Database error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    renderWithRouter(<ProfileSettings />)

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
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

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
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const { rerender } = renderWithRouter(<ProfileSettings />)

    // Initially isSubscribed is false
    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))
    expect(mockSubscribe).toHaveBeenCalled()

    // Rerender with isSubscribed = true
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true, needsInstall: false,
      permission: 'granted',
      isSubscribed: true,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      updatePreferences: mockUpdatePreferences
    })

    rerender(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    
    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('shows a toast when the push toggle fails', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: { id: '123', display_name: 'Test Player' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    mockSubscribe.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithRouter(<ProfileSettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'Use push notifications' }))

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Failed to update push notification settings. Please try again.', 'error')
    })
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
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

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
      updatePreferences: mockUpdatePreferences
    })

    renderWithRouter(<ProfileSettings />)
    expect(screen.getByText('Push notifications are not configured on the server.')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Use push notifications' })).not.toBeInTheDocument()
  })

  it('disables the push checkbox when push is unavailable and keeps badges enabled', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: false, needsInstall: false,
      permission: 'default',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      updatePreferences: mockUpdatePreferences
    })

    renderWithRouter(<ProfileSettings />)

    expect(screen.getByLabelText('Send me Push Notifications')).toBeDisabled()
    expect(screen.getByLabelText('Show Unread Badges')).toBeEnabled()
  })

  it('shows iOS install message when needsInstall is true', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: false, needsInstall: true,
      permission: 'default',
      isSubscribed: false,
      preferences: { push_enabled: true, badge_enabled: true } as any,
      loading: false,
      error: null,
      subscribeToPush: mockSubscribe,
      unsubscribeFromPush: mockUnsubscribe,
      updatePreferences: mockUpdatePreferences
    })

    renderWithRouter(<ProfileSettings />)

    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.getByLabelText('Send me Push Notifications')).toBeDisabled()
  })

  it('downloads user data on export', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: { id: '123', display_name: 'Test Player' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    vi.mocked(buildUserDataExport).mockResolvedValue({ exported_at: 'x' } as any)

    renderWithRouter(<ProfileSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Download My Data' }))

    await waitFor(() => {
      expect(buildUserDataExport).toHaveBeenCalledWith('123')
      expect(downloadJson).toHaveBeenCalledWith({ exported_at: 'x' }, 'rolebypost_export_123.json')
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Your data has been downloaded.', 'success')
    })
  })

  it('shows a toast when export fails', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    vi.mocked(buildUserDataExport).mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithRouter(<ProfileSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Download My Data' }))

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Failed to export your data. Please try again.', 'error')
    })
  })

  it('requires typing DELETE before confirming account deletion', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    const confirm = screen.getByRole('button', { name: 'Permanently Delete' })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELET' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    expect(confirm).toBeEnabled()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('deletes the account and signs out on confirmation', async () => {
    const mockSignOut = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: mockSignOut,
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: null } as any)

    renderWithRouter(<ProfileSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }))

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' })
      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  it('shows a toast and keeps the dialog open when deletion fails', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: new Error('down') } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithRouter(<ProfileSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }))

    await waitFor(() => {
      expect(vi.mocked(useToast)().addToast).toHaveBeenCalledWith('Failed to delete account. Please try again.', 'error')
    })
    expect(screen.getByRole('button', { name: 'Permanently Delete' })).toBeInTheDocument()
  })

  it('links to the privacy policy', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123' } as any,
      profile: { id: '123' } as any,
      session: null,

      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    renderWithRouter(<ProfileSettings />)

    // The privacy policy shows in the Account & Data card (and inline on the
    // new email-consent checkbox), so assert on all instances.
    const links = screen.getAllByRole('link', { name: 'Privacy Policy' })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/privacy')
    }
  })
})

describe('ProfileSettings email consent', () => {
  const profile = (over: Record<string, unknown> = {}) => ({
    id: '123', display_name: 'Test Player', avatar_url: null, created_at: '',
    is_suspended: false, email_opt_in: false, email_opt_in_at: null, age_verified_at: null, terms_accepted_at: null, terms_version: null, ...over
  })

  const setup = (email_opt_in: boolean) => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      error: null,
      user: { id: '123', email: 'user@example.com' } as any,
      profile: profile({ email_opt_in }),
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })
  }

  const updateEq = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePushNotifications).mockReturnValue({
      isSupported: false, needsInstall: true, isConfigured: true,
      permission: 'default', isSubscribed: false, preferences: null,
      loading: false, subscribeToPush: vi.fn(), unsubscribeFromPush: vi.fn(),
      updatePreferences: vi.fn()
    } as any)
    // profiles.update(...).eq('id', ...) — unchecked by default, error-less.
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn(() => ({ eq: updateEq }))
    } as any)
    updateEq.mockResolvedValue({ error: null })
  })

  it('renders the consent checkbox unchecked by default', () => {
    setup(false)
    render(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    const box = screen.getByRole('checkbox', { name: /Email me about Role by Post/ })
    expect(box).not.toBeChecked()
  })

  it('renders as checked when the profile has opted in', () => {
    setup(true)
    render(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    expect(screen.getByRole('checkbox', { name: /Email me about Role by Post/ })).toBeChecked()
  })

  it('checking the box persists the opt-in and refreshes the profile', async () => {
    setup(false)
    const refreshProfile = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false, error: null, user: { id: '123' } as any,
      profile: profile({ email_opt_in: false }), session: null,
      signInWithGoogle: vi.fn(), signOut: vi.fn(), refreshProfile,
      termsConfirmState: 'idle', retryTermsConfirm: vi.fn(),
    })

    render(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    fireEvent.click(screen.getByRole('checkbox', { name: /Email me about Role by Post/ }))

    await waitFor(() => {
      expect(updateEq).toHaveBeenCalledWith('id', '123')
    })
    expect(refreshProfile).toHaveBeenCalled()
    expect(useToast().addToast).toHaveBeenCalledWith(
      "You're signed up for email updates.", 'success'
    )
  })

  it('unchecking persists the opt-out and toasts', async () => {
    setup(true)
    render(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    fireEvent.click(screen.getByRole('checkbox', { name: /Email me about Role by Post/ }))

    await waitFor(() => {
      expect(updateEq).toHaveBeenCalledWith('id', '123')
    })
    expect(useToast().addToast).toHaveBeenCalledWith('Email updates turned off.', 'success')
  })

  it('toasts on failure without proceeding silently', async () => {
    setup(false)
    updateEq.mockResolvedValue({ error: { message: 'rls' } })
    render(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    fireEvent.click(screen.getByRole('checkbox', { name: /Email me about Role by Post/ }))

    await waitFor(() => {
      expect(useToast().addToast).toHaveBeenCalledWith(
        'Failed to update your email preference. Please try again.', 'error'
      )
    })
  })

  it('links the consent copy to the privacy policy', () => {
    setup(false)
    render(<MemoryRouter><ProfileSettings /></MemoryRouter>)
    // At least two privacy links exist (consent copy + Account & Data card).
    const links = screen.getAllByRole('link', { name: 'Privacy Policy' })
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/privacy')
    }
  })
})
