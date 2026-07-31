import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../features/auth/useAuth'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('ProtectedRoute', () => {
  it('renders loading spinner when loading is true', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: true,
      user: null,
      profile: null,
      session: null,
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

  it('redirects to login when no user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders outlet content when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: null,
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute />}>
            <Route index element={<div data-testid="protected-content" />} />
          </Route>
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })
})
