import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../features/auth/useAuth'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

function LoginSpy() {
  const location = useLocation()
  return <div data-testid="login-page" data-from={(location.state as { from?: string } | null)?.from} />
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear()
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

  it('redirects to login when no user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
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
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
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
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
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
})
