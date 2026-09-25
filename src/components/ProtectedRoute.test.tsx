import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../features/auth/useAuth'
import { confirmAge, confirmTerms } from '../features/auth/authApi'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/auth/authApi', () => ({
  confirmAge: vi.fn(),
  confirmTerms: vi.fn(),
}))

function LoginSpy() {
  const location = useLocation()
  return <div data-testid="login-page" data-from={(location.state as { from?: string } | null)?.from} />
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('renders loading spinner when loading is true', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: true,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const { container } = render(
      <MemoryRouter>
        <ProtectedRoute />
      </MemoryRouter>
    )

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders error state when session load fails', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: new Error('Session error'),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load your session/)
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('renders login page inline at / when no user is authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="lobby" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.queryByTestId('lobby')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument()
  })

  it('redirects to login when no user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('preserves the intended destination in the login redirect state', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/join/123?code=abc']}>
        <Routes>
          <Route path="/join/:id" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('login-page')).toHaveAttribute('data-from', '/join/123?code=abc')
  })

  it('redirects to saved destination after login', () => {
    sessionStorage.setItem('auth_redirect', '/join/123?code=abc')
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: '2026-09-24' } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="lobby" />} />
          </Route>
          <Route path="/join/:id" element={<div data-testid="join-page" />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('join-page')).toBeInTheDocument()
    expect(sessionStorage.getItem('auth_redirect')).toBeNull()
  })

  it('renders outlet content when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: '2026-09-24' } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('holds the loading state while the signed-in profile is unresolved', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('gates the app behind re-consent when the stored terms version is stale', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: '1999-01-01' } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Our Terms and Privacy Policy have changed')).toBeInTheDocument()
    expect(screen.getByText(/You last accepted version 1999-01-01\./)).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('holds the app while a checkbox-covered acceptance is being recorded', () => {
    localStorage.setItem('terms-agreed-version', '2026-09-24')
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: null } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'pending',
      retryTermsConfirm: vi.fn(),
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    // The server record has not landed yet: no gate, no content — spinner.
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('offers a retry without re-accepting when recording the acceptance fails', () => {
    const retryTermsConfirm = vi.fn()
    localStorage.setItem('terms-agreed-version', '2026-09-24')
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: null } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'failed',
      retryTermsConfirm,
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/We could not save your agreement to the Terms/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retryTermsConfirm).toHaveBeenCalledTimes(1)
  })

  it('gates once as a fail-safe when no acceptance was ever recorded', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: null } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    // Pre-terms account with nothing recorded and no checkbox evidence.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/You last accepted version/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renders outlet content when the stored terms version is current', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: '2026-09-24' } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stamps the acceptance and refreshes the profile on agree', async () => {
    const refreshProfile = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: { id: 'test', terms_version: '1999-01-01' } as any,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile,
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })
    vi.mocked(confirmAge).mockResolvedValue(undefined)
    vi.mocked(confirmTerms).mockResolvedValue(undefined)

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<LoginSpy />} />
        </Routes>
      </MemoryRouter>
    )

    // The account has no age record, so the gate collects the attestation too.
    fireEvent.click(screen.getByLabelText('I am at least 16 years old.'))
    fireEvent.click(screen.getByRole('button', { name: /I accept the updated Terms/ }))

    await waitFor(() => {
      expect(confirmAge).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(confirmTerms).toHaveBeenCalledWith('2026-09-24')
    })
    await waitFor(() => {
      expect(refreshProfile).toHaveBeenCalled()
    })
  })
})
