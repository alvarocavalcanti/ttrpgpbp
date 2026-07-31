import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { useAuth } from './useAuth'
import { BrowserRouter } from 'react-router-dom'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('LoginPage', () => {
  it('renders loading state', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: true,
      user: null,
      profile: null,
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    const { container } = render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )
    
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('redirects if user is already authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'test' } as any,
      profile: null,
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    })

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )
    
    // We can't directly check Navigate component in a simple render without 
    // memory router spy, but we can check the sign-in button is NOT rendered
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument()
  })

  it('renders sign in button and calls signInWithGoogle', () => {
    const mockSignIn = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      signInWithGoogle: mockSignIn,
      signOut: vi.fn(),
    })

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )
    
    const button = screen.getByText('Sign in with Google')
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })
})
