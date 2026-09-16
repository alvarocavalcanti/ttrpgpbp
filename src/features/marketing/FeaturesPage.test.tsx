import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { FeaturesPage } from './FeaturesPage'
import { useAuth } from '../auth/useAuth'
import { trackEvent } from '../../lib/analytics'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

function mockAuth(user: unknown, loading = false) {
  vi.mocked(useAuth).mockReturnValue({
    loading,
    user: user as never,
    profile: null,
    session: null,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FeaturesPage />
    </MemoryRouter>
  )
}

describe('FeaturesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(null)
  })

  it('renders the hero with two Start now CTAs pointing at /', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'Play your tabletop RPG, one post at a time' })
    ).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: 'Start now!' })
    expect(ctas).toHaveLength(2)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/')
    }
  })

  it('shows the slim header with Sign in for anonymous visitors', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('hides the slim header when signed in but still renders the page', () => {
    mockAuth({ id: 'user-1' })
    renderPage()

    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Play your tabletop RPG, one post at a time' })
    ).toBeInTheDocument()
  })

  it('hides the slim header while auth is still loading', () => {
    mockAuth(null, true)
    renderPage()

    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('defaults to the GM track', () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Game Masters' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Players' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('heading', { name: 'Run the table your way' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Your campaigns in one place' })
    ).not.toBeInTheDocument()
  })

  it('swaps to the player track and tracks the toggle', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Players' }))

    expect(screen.getByRole('button', { name: 'Players' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(
      screen.getByRole('heading', { name: 'Your campaigns in one place' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Run the table your way' })
    ).not.toBeInTheDocument()
    expect(trackEvent).toHaveBeenCalledWith('marketing_track_toggle', { track: 'player' })
  })

  it('does not track when the already-active track is clicked again', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Game Masters' }))

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('tracks CTA clicks with their location', () => {
    renderPage()

    const ctas = screen.getAllByRole('link', { name: 'Start now!' })
    fireEvent.click(ctas[0])
    expect(trackEvent).toHaveBeenCalledWith('marketing_cta_click', { location: 'hero' })
    fireEvent.click(ctas[1])
    expect(trackEvent).toHaveBeenCalledWith('marketing_cta_click', { location: 'bottom' })
  })

  it('lists more features and footer links', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'And a lot more' })).toBeInTheDocument()
    expect(screen.getByText('Drafts that survive')).toBeInTheDocument()
    expect(screen.getByText('Invite-only tables')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy'
    )
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms'
    )
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/alvarocavalcanti/ttrpgpbp'
    )
  })
})
