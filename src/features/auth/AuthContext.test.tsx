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
      <button onClick={context.signInWithGoogle}>Sign In</button>
      <button onClick={context.signOut}>Sign Out</button>
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
      expect(console.error).toHaveBeenCalledWith('Error fetching profile on auth change:', expect.any(Error))
      expect(screen.getByTestId('user')).toHaveTextContent('user-456')
      expect(screen.getByTestId('profile')).toHaveTextContent('no-profile')
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




