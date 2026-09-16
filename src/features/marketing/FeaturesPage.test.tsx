import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
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

// Every card image must resolve to a committed thumbnail that is smaller
// than its full-size source — fails loudly when thumbs are not committed
// or a thumb is accidentally a copy of the full capture.
function assertThumbsOnDisk(sources: Array<string | null>) {
  for (const source of sources) {
    expect(source).toMatch(/^\/help\/thumbs\/.+\.webp$/)
    const thumbPath = resolve(process.cwd(), 'public', (source as string).slice(1))
    const fullPath = thumbPath.replace('/thumbs/', '/').replace(/\.webp$/, '.png')
    expect(existsSync(thumbPath)).toBe(true)
    expect(statSync(thumbPath).size).toBeLessThan(statSync(fullPath).size)
  }
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
      screen.queryByText('Sign in with Google and start your first campaign in minutes.')
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Play your tabletop RPG, one post at a time' })
    ).toBeInTheDocument()
  })

  it('shows the sign-in prompt copy to anonymous visitors only', () => {
    renderPage()

    expect(
      screen.getByText('Sign in with Google and start your first campaign in minutes.')
    ).toBeInTheDocument()
  })

  it('hides the slim header while auth is still loading', () => {
    mockAuth(null, true)
    renderPage()

    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(
      screen.queryByText('Sign in with Google and start your first campaign in minutes.')
    ).not.toBeInTheDocument()
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

  it('serves WebP thumbnails, not the full-size help captures, on the GM track', () => {
    renderPage()

    // The hero and logo images have empty alt text (role presentation), so
    // only the four card images match the img role.
    const sources = screen.getAllByRole('img').map((img) => img.getAttribute('src'))
    expect(sources).toEqual([
      '/help/thumbs/gm-settings.webp',
      '/help/thumbs/npc-composer.webp',
      '/help/thumbs/status-bar.webp',
      '/help/thumbs/safety-tools.webp',
    ])
    assertThumbsOnDisk(sources)
  })

  it('serves WebP thumbnails on the player track', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Players' }))

    const sources = screen.getAllByRole('img').map((img) => img.getAttribute('src'))
    expect(sources).toEqual([
      '/help/thumbs/lobby-with-channels.webp',
      '/help/thumbs/message-actions.webp',
      '/help/thumbs/ability-check.webp',
      '/help/thumbs/sidebar.webp',
    ])
    assertThumbsOnDisk(sources)
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
