import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ContentPage } from './ContentPage'
import { useAuth } from '../auth/useAuth'
import { trackEvent } from '../../lib/analytics'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

function mockAuth(user: unknown) {
  vi.mocked(useAuth).mockReturnValue({ user: user as never } as never)
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play-by-post" element={<ContentPage />} />
        <Route path="/how-to/run-play-by-post" element={<ContentPage />} />
        <Route path="/vs/discord" element={<ContentPage />} />
        <Route path="/alternatives" element={<ContentPage />} />
        <Route path="/alternatives/rpol" element={<ContentPage />} />
        <Route path="/alternatives/myth-weavers" element={<ContentPage />} />
        <Route path="/ai-disclaimer" element={<ContentPage />} />
        <Route path="/not-content" element={<ContentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ContentPage', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  it('renders the h1, breadcrumbs, and markdown body for a content route', () => {
    mockAuth(null)
    renderAt('/play-by-post')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Play-by-Post Tabletop RPGs' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0)
    expect(screen.getByText(/tabletop roleplaying played in writing/i)).toBeInTheDocument()
  })

  it('credits the author with a link to the About page (#645)', () => {
    mockAuth(null)
    renderAt('/play-by-post')
    const links = screen.getAllByRole('link', { name: 'Alvaro Cavalcanti' })
    expect(links.some((link) => link.getAttribute('href') === 'https://memorablenaton.es')).toBe(true)
  })

  it('sets the SEO title from the route registry', () => {
    mockAuth(null)
    renderAt('/play-by-post')
    expect(document.title).toBe('Play-by-Post Tabletop RPGs — Role by Post')
  })

  it('renders a different document per route', () => {
    mockAuth(null)
    renderAt('/how-to/run-play-by-post')
    expect(
      screen.getByRole('heading', { level: 1, name: 'How to Run a Play-by-Post Game' }),
    ).toBeInTheDocument()
  })

  it('resolves a route with a trailing slash instead of rendering blank', () => {
    mockAuth(null)
    renderAt('/play-by-post/')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Play-by-Post Tabletop RPGs' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Play-by-Post Tabletop RPGs — Role by Post')
  })

  it('renders the AI disclaimer with its GitHub evidence links', () => {
    mockAuth(null)
    renderAt('/ai-disclaimer')

    expect(screen.getByRole('heading', { level: 1, name: 'AI Disclaimer' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'reviewed every change' }),
    ).toHaveAttribute('href', 'https://github.com/alvarocavalcanti/ttrpgpbp/pulls?q=is%3Apr+is%3Amerged')
    expect(document.title).toBe('AI Disclaimer — Role by Post')
  })

  it('renders nothing for an unregistered path', () => {
    mockAuth(null)
    const { container } = renderAt('/not-content')
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the RPOL comparison with its hero heading', () => {
    mockAuth(null)
    renderAt('/alternatives/rpol')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'RPOL Alternative: A Modern Home for Play-by-Post',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Where RPOL is still the right home' }),
    ).toBeInTheDocument()
  })

  it('renders the alternatives hub', () => {
    mockAuth(null)
    renderAt('/alternatives')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Play-by-Post Alternatives' }),
    ).toBeInTheDocument()
  })

  it('links the alternatives breadcrumb to the hub', () => {
    mockAuth(null)
    renderAt('/alternatives/rpol')
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const crumb = within(breadcrumb).getByRole('link', { name: 'Alternatives' })
    expect(crumb).toHaveAttribute('href', '/alternatives')
  })

  it('shows the doc screenshots as figures with captions', () => {
    mockAuth(null)
    const { container } = renderAt('/alternatives/rpol')

    const figures = container.querySelectorAll('figure')
    expect(figures).toHaveLength(3)
    expect(
      screen.getByText('A campaign reads back like a story — rolls, scene breaks, and notes in one place.'),
    ).toBeInTheDocument()
    // Thumbnails come from the committed WebP set, never the full PNGs.
    const firstThumb = container.querySelector('figure img')
    expect(firstThumb).toHaveAttribute('src', '/help-images/thumbs/status-bar.webp')
  })

  it('opens a screenshot in the enlarged viewer', () => {
    mockAuth(null)
    renderAt('/alternatives/rpol')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'View A campaign reads back like a story — rolls, scene breaks, and notes in one place. fullscreen',
      }),
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(trackEvent).toHaveBeenCalledWith('content_image_open', {
      src: '/help-images/status-bar.png',
      path: '/alternatives/rpol',
    })
  })

  it('reports each CTA placement separately', () => {
    // One render per placement: clicking a CTA navigates, so the page (and the
    // other buttons) unmount before a second click.
    for (const [index, location] of ['after_intro', 'bottom', 'sticky'].entries()) {
      mockAuth(null)
      const { unmount } = renderAt('/alternatives/rpol')
      fireEvent.click(screen.getAllByRole('link', { name: 'Start now' })[index])
      expect(trackEvent).toHaveBeenLastCalledWith('marketing_cta_click', {
        location,
        path: '/alternatives/rpol',
      })
      unmount()
    }
  })

  it('sends signed-out visitors to sign-in', () => {
    mockAuth(null)
    renderAt('/alternatives/rpol')
    expect(screen.getAllByRole('link', { name: 'Start now' })[0]).toHaveAttribute('href', '/login')
  })

  it('renders the phone-only start bar for signed-out visitors', () => {
    mockAuth(null)
    renderAt('/play-by-post')
    // The bar is CSS-hidden from md up; its visibility never depends on JS.
    const bar = screen.getByText('Free to play').closest('div')!.parentElement!
    expect(bar).toHaveClass('md:hidden')
    expect(bar).toHaveClass('fixed')
  })

  it('omits every CTA for signed-in visitors', () => {
    mockAuth({ id: 'user-1' })
    renderAt('/alternatives/rpol')
    expect(screen.queryAllByRole('link', { name: 'Start now' })).toHaveLength(0)
    expect(screen.queryByText('Free to play')).not.toBeInTheDocument()
  })

  it('still offers the bottom CTA on a doc without a shots marker', () => {
    mockAuth(null)
    const { container } = renderAt('/play-by-post')
    expect(container.querySelectorAll('figure')).toHaveLength(0)
    // bottom + sticky, no placeholder where the marker would sit.
    expect(screen.getAllByRole('link', { name: 'Start now' })).toHaveLength(2)
  })

  it('uses the page-specific social card where one is configured', () => {
    mockAuth(null)
    const { unmount } = renderAt('/alternatives/rpol')
    expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
      'content',
      expect.stringContaining('/og-image-rpol.png'),
    )
    unmount()

    const mythWeavers = renderAt('/alternatives/myth-weavers')
    expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
      'content',
      expect.stringContaining('/og-image-myth-weavers.png'),
    )
    mythWeavers.unmount()

    renderAt('/play-by-post')
    expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
      'content',
      expect.stringContaining('/og-image.png'),
    )
  })

  it('credits Myth-Weavers and links out to it', () => {
    mockAuth(null)
    renderAt('/alternatives/myth-weavers')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Myth-Weavers Alternative: Play-by-Post With Character Sheets',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Where Myth-Weavers is still the right home' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'look at Myth-Weavers yourself' })).toHaveAttribute(
      'href',
      'https://www.myth-weavers.com',
    )
    expect(screen.getByRole('link', { name: 'Their sheet guide' })).toHaveAttribute(
      'href',
      'https://static.myth-weavers.com/help/character-sheets.html',
    )
    expect(document.title).toBe('Myth-Weavers Alternative — Role by Post')
  })

  it('highlights rooms and notes on the Myth-Weavers comparison', () => {
    mockAuth(null)
    renderAt('/alternatives/myth-weavers')

    expect(
      screen.getByRole('heading', { level: 3, name: 'Rooms keep side talk out of the story' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Notes that live with the campaign' }),
    ).toBeInTheDocument()
  })

  it('shows its own screenshots on the Myth-Weavers comparison', () => {
    mockAuth(null)
    const { container } = renderAt('/alternatives/myth-weavers')

    expect(container.querySelectorAll('figure')).toHaveLength(3)
    expect(container.querySelector('figure img')).toHaveAttribute(
      'src',
      '/help-images/thumbs/message-actions.webp',
    )
    // Marker present: bottom + sticky + after_intro.
    expect(screen.getAllByRole('link', { name: 'Start now' })).toHaveLength(3)
  })

  it('highlights rooms on the Discord comparison with the registry title', () => {
    mockAuth(null)
    renderAt('/vs/discord')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Role by Post vs Discord for Play-by-Post' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Rooms, not channel sprawl' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Role by Post vs Discord — Role by Post')
  })

  it('hides the slim header for signed-in visitors', () => {
    mockAuth({ id: 'user-1' })
    renderAt('/play-by-post')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
