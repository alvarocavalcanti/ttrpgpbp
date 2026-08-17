import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoginPage } from './LoginPage'
import { useAuth } from './useAuth'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('renders loading state', () => {
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
        <LoginPage />
      </MemoryRouter>
    )
    
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('redirects if user is already authenticated', () => {
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
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument()
  })

  it('renders sign in button and calls signInWithGoogle', () => {
    const mockSignIn = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: mockSignIn,
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    
    const button = screen.getByText('Sign in with Google')
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('saves the intended destination to sessionStorage before signing in', () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: mockSignIn,
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/join/123?code=abc' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Sign in with Google'))

    expect(sessionStorage.getItem('auth_redirect')).toBe('/join/123?code=abc')
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('renders the feature highlights section', () => {
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
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Why RoleByPost?')).toBeInTheDocument()
    expect(screen.getByText('Real-time Chat')).toBeInTheDocument()
    expect(screen.getByText('Dice Rolling')).toBeInTheDocument()
    expect(screen.getByText('Campaign Management')).toBeInTheDocument()
    expect(screen.getByText('Push Notifications')).toBeInTheDocument()
    expect(screen.getByText('Mobile First')).toBeInTheDocument()
  })

  it('renders the product positioning copy', () => {
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
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Text-first, no bloat' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Not a VTT' })).toBeInTheDocument()
    expect(screen.getByText(/chat-first app for asynchronous tabletop RPGs/)).toBeInTheDocument()
    expect(screen.getByText(/generic play is built in, with optional Shadowdark character stats/)).toBeInTheDocument()
    expect(screen.getByText(/battle maps, tactical combat automation, animated dice/)).toBeInTheDocument()
  })

  it('renders the feature grid with responsive layout', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    const { container } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const grid = container.querySelector('.grid')
    expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3')
  })
})
