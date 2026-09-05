import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider, AuthContext } from './AuthContext'
import { useContext } from 'react'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}))

function TestComponent() {
  const context = useContext(AuthContext)
  if (!context) return null

  return (
    <div>
      <div data-testid="loading">{context.loading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{context.user ? context.user.id : 'no-user'}</div>
      <div data-testid="profile">{context.profile ? context.profile.display_name : 'no-profile'}</div>
      <div data-testid="error">{context.error ? 'error' : 'no-error'}</div>
      <button type="button" onClick={context.signInWithGoogle}>Sign In</button>
      <button type="button" onClick={context.signOut}>Sign Out</button>
      <button type="button" onClick={() => void context.refreshProfile()}>Refresh Profile</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error for expected errors
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('provides initial null session when getSession returns no user', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
    expect(screen.getByTestId('profile')).toHaveTextContent('no-profile')
  })

  it('handles getSession error gracefully', async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('Auth error'))

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('Error getting initial session:', expect.any(Error))
    expect(screen.getByTestId('error')).toHaveTextContent('error')
  })

  it('provides user and profile when getSession returns a user', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'user-123', display_name: 'Test User' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('user')).toHaveTextContent('user-123')
    expect(screen.getByTestId('profile')).toHaveTextContent('Test User')
  })

  it('handles auth state change with user login', async () => {
    let authCallback: any = null
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'test' } } } as any
    })

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'user-456', display_name: 'Logged In User' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()

    // Simulate login
    authCallback('SIGNED_IN', { user: { id: 'user-456' } })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('user-456')
      expect(screen.getByTestId('profile')).toHaveTextContent('Logged In User')
    })
  })
  
  it('handles auth state change with user login but profile fetch fails', async () => {
    let authCallback: any = null
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'test' } } } as any
    })

    const mockSingle = vi.fn().mockRejectedValue(new Error('DB error'))
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()

    // Simulate login
    authCallback('SIGNED_IN', { user: { id: 'user-456' } })

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error fetching profile:', expect.any(Error))
      expect(screen.getByTestId('user')).toHaveTextContent('user-456')
      expect(screen.getByTestId('profile')).toHaveTextContent('no-profile')
      expect(screen.getByTestId('error')).toHaveTextContent('error')
    })
  })

  it('handles auth state change with logout', async () => {
    let authCallback: any = null
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'test' } } } as any
    })

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'user-123', display_name: 'Test User' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    
    // Simulate logout
    authCallback('SIGNED_OUT', null)

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('no-user')
      expect(screen.getByTestId('profile')).toHaveTextContent('no-profile')
    })
  })

  it('calls signInWithOAuth when signInWithGoogle is clicked', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sign In'))
    
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
  })

  it('surfaces a sign-in error instead of swallowing it', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    vi.mocked(supabase.auth.signInWithOAuth).mockRejectedValue(new Error('popup blocked'))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sign In'))

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('error')
    })
  })

  it('surfaces a sign-in error returned by the OAuth call', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { session: null },
      error: new Error('oauth provider error'),
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sign In'))

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('error')
    })
  })

  it('does not refetch the profile when the user is unchanged (TOKEN_REFRESHED)', async () => {
    let authCallback: any = null
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-456' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'test' } } } as any
    })

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'user-456', display_name: 'Test User' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('profile')).toHaveTextContent('Test User')

    // Token refresh with the same identity must not trigger another fetch.
    authCallback('TOKEN_REFRESHED', { user: { id: 'user-456' } })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('user-456')
    })

    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('retries the profile fetch after signing out and back in', async () => {
    let authCallback: any = null
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'test' } } } as any
    })

    const mockSingle = vi.fn()
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({
        data: { id: 'user-456', display_name: 'Recovered' },
        error: null,
      })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()

    // First login: profile fetch fails, error surfaces, profile stays null.
    authCallback('SIGNED_IN', { user: { id: 'user-456' } })

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('error')
      expect(screen.getByTestId('profile')).toHaveTextContent('no-profile')
    })

    // Sign out resets the fetch guard so a later sign-in retries.
    authCallback('SIGNED_OUT', null)

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('no-user')
      expect(screen.getByTestId('profile')).toHaveTextContent('no-profile')
    })

    // Re-login with the same user retries and recovers.
    authCallback('SIGNED_IN', { user: { id: 'user-456' } })

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
      expect(screen.getByTestId('profile')).toHaveTextContent('Recovered')
    })
  })

  it('refreshProfile re-fetches the profile so context state reflects edits', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'user-123', display_name: 'Test User' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('profile')).toHaveTextContent('Test User')

    // The saved edit lands in the DB, then the app re-reads the profile.
    mockSingle.mockResolvedValue({
      data: { id: 'user-123', display_name: 'Updated Name' },
      error: null,
    })
    fireEvent.click(screen.getByText('Refresh Profile'))

    await waitFor(() => {
      expect(screen.getByTestId('profile')).toHaveTextContent('Updated Name')
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous profile when refreshProfile fails', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'user-123', display_name: 'Test User' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('profile')).toHaveTextContent('Test User')

    mockSingle.mockRejectedValue(new Error('DB error'))
    fireEvent.click(screen.getByText('Refresh Profile'))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error refreshing profile:', expect.any(Error))
    })
    expect(screen.getByTestId('profile')).toHaveTextContent('Test User')
  })

  it('calls signOut when signOut is clicked', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'test' } },
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sign Out'))
    
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})




