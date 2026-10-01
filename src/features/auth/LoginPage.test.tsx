import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LoginPage, isValidEmail } from './LoginPage'
import { useAuth } from './useAuth'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    window.location.hash = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders loading state', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: true,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
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
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
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
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    
    const button = screen.getByText('Sign in with Google')
    expect(button).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/at least 16 years old/))
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
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/join/123?code=abc' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByLabelText(/at least 16 years old/))
    fireEvent.click(screen.getByText('Sign in with Google'))

    expect(sessionStorage.getItem('auth_redirect')).toBe('/join/123?code=abc')
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('covers age and terms acceptance in a single required checkbox', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    // One checkbox records both consents: the 16+ attestation (stamped by
    // confirm_age) and the terms acceptance (stamped by confirm_terms).
    const checkbox = screen.getByLabelText(/I am at least 16 years old and agree to the/)
    expect(checkbox).toHaveAttribute('type', 'checkbox')
    expect(checkbox).not.toBeChecked()
  })

  it('disables sign in until the age checkbox is checked', () => {
    const mockSignIn = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: mockSignIn,
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const button = screen.getByText('Sign in with Google')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('persists the age confirmation and enables sign in when checked', () => {
    const mockSignIn = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: mockSignIn,
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByLabelText(/at least 16 years old/))

    expect(localStorage.getItem('age-confirmed')).toBe('true')
    expect(screen.getByText('Sign in with Google')).toBeEnabled()
  })

  it('names the terms version the checkbox agrees to', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByLabelText(/I am at least 16 years old and agree to the/)).toBeInTheDocument()
    expect(screen.getByText(/\(v2026-09-29\)/)).toBeInTheDocument()
  })

  it('records the agreed terms version when the checkbox is checked', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const checkbox = screen.getByLabelText(/at least 16 years old/)
    fireEvent.click(checkbox)
    expect(localStorage.getItem('terms-agreed-version')).toBe('2026-09-29')

    fireEvent.click(checkbox)
    expect(localStorage.getItem('terms-agreed-version')).toBeNull()
  })

  it('keeps sign in enabled when the age flag is already stored', () => {
    localStorage.setItem('age-confirmed', 'true')
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: null,
      profile: null,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      termsConfirmState: 'idle',
      retryTermsConfirm: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Sign in with Google')).toBeEnabled()
    expect(screen.getByLabelText(/at least 16 years old/)).toBeChecked()
  })

  describe('email magic link', () => {
    it('validates email shape without any network call', () => {
      expect(isValidEmail('player@example.com')).toBe(true)
      expect(isValidEmail('player@example')).toBe(false)
      expect(isValidEmail('not-an-email')).toBe(false)
      expect(isValidEmail('')).toBe(false)
    })

    it('rejects an invalid email before requesting a link', () => {
      const mockEmail = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: mockEmail,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByLabelText(/at least 16 years old/))
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } })
      fireEvent.click(screen.getByText('Email me a sign-in link'))

      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
      expect(mockEmail).not.toHaveBeenCalled()
    })

    it('keeps the email submit disabled until the age checkbox is checked', () => {
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      expect(screen.getByText('Email me a sign-in link')).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } })
      expect(screen.getByText('Email me a sign-in link')).toBeDisabled()
    })

    it('shows a pending-confirmation panel after a successful request', async () => {
      const mockEmail = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: mockEmail,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByLabelText(/at least 16 years old/))
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } })
      fireEvent.click(screen.getByText('Email me a sign-in link'))
      await act(async () => {})

      expect(mockEmail).toHaveBeenCalledWith('player@example.com', undefined)
      expect(screen.getByText('Check your email')).toBeInTheDocument()
      expect(screen.getByText('player@example.com')).toBeInTheDocument()
    })

    it('shows a friendly error when the request fails', async () => {
      const mockEmail = vi.fn().mockResolvedValue({ error: new Error('rate limited') })
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: mockEmail,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByLabelText(/at least 16 years old/))
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } })
      fireEvent.click(screen.getByText('Email me a sign-in link'))
      await act(async () => {})

      expect(screen.getByText(/couldn't send your sign-in link/)).toBeInTheDocument()
    })

    it('enforces a resend cooldown and requests a fresh link afterwards', async () => {
      vi.useFakeTimers()
      const mockEmail = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: mockEmail,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByLabelText(/at least 16 years old/))
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } })
      fireEvent.click(screen.getByText('Email me a sign-in link'))
      await act(async () => {})

      expect(screen.getByRole('button', { name: /Resend link/ })).toBeDisabled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })

      const resend = screen.getByRole('button', { name: 'Resend link' })
      expect(resend).toBeEnabled()
      fireEvent.click(resend)
      await act(async () => {})

      expect(mockEmail).toHaveBeenCalledTimes(2)
    })

    it('lets the player go back and use a different email', async () => {
      const mockEmail = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: mockEmail,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByLabelText(/at least 16 years old/))
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } })
      fireEvent.click(screen.getByText('Email me a sign-in link'))
      await act(async () => {})

      fireEvent.click(screen.getByText('Use a different email'))
      expect(screen.getByLabelText('Email address')).toHaveValue('')
    })
  })

  describe('magic-link return handling', () => {
    it('seeds the intended destination from the redirect param', () => {
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent('/join/123?code=abc')}`]}>
          <LoginPage />
        </MemoryRouter>
      )

      expect(sessionStorage.getItem('auth_redirect')).toBe('/join/123?code=abc')
    })

    it('ignores an unsafe redirect param', () => {
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent('//evil.example.com')}`]}>
          <LoginPage />
        </MemoryRouter>
      )

      expect(sessionStorage.getItem('auth_redirect')).toBeNull()
    })

    it('continues when session storage cannot persist the redirect', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent('/join/123?code=abc')}`]}>
          <LoginPage />
        </MemoryRouter>
      )

      // Storage failure must not reach the route error boundary and block sign-in.
      expect(screen.getByText('Email me a sign-in link')).toBeInTheDocument()

      setItem.mockRestore()
      vi.mocked(console.warn).mockRestore()
    })

    it('rejects a backslash-smuggled redirect param', () => {
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent('/\\evil.example.com')}`]}>
          <LoginPage />
        </MemoryRouter>
      )

      expect(sessionStorage.getItem('auth_redirect')).toBeNull()
    })

    it('shows an actionable error for an expired link and clears the fragment', () => {
      window.location.hash = '#error=access_denied&error_code=otp_expired'
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      expect(screen.getByRole('alert')).toHaveTextContent(/expired or was already used/)
      expect(window.location.hash).toBe('')
    })

    it('shows an actionable error for an invalid link', () => {
      window.location.hash = '#error=access_denied&error_code=bad_code'
      vi.mocked(useAuth).mockReturnValue({
        loading: false,
        user: null,
        profile: null,
        session: null,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        termsConfirmState: 'idle',
        retryTermsConfirm: vi.fn(),
      })

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      )

      expect(screen.getByRole('alert')).toHaveTextContent(/isn't valid/)
    })
  })
})
