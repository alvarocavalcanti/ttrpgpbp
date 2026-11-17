import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DirectoryPage } from './DirectoryPage'
import { useAuth } from '../auth/useAuth'
import { usePublicChannelsAnon } from './usePublicChannelsAnon'
import { usePlatformStats } from '../../hooks/usePlatformStats'
import { trackEvent } from '../../lib/analytics'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('./usePublicChannelsAnon', () => ({ usePublicChannelsAnon: vi.fn() }))
vi.mock('../../hooks/usePlatformStats', () => ({ usePlatformStats: vi.fn() }))
vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const platformStats = {
  games: 42,
  messages: 1_240,
  members: 17,
  activeGames: 5,
  recruitingGames: 3,
  newGamesWeek: 2,
}

function mockStats(overrides: Record<string, unknown> = {}) {
  vi.mocked(usePlatformStats).mockReturnValue({ stats: platformStats, loading: false, ...overrides } as never)
}

function mockChannels(overrides: Record<string, unknown> = {}) {
  const loadMore = vi.fn()
  const refetch = vi.fn()
  vi.mocked(usePublicChannelsAnon).mockReturnValue({
    channels: [
      { name: 'Weekly Delves', description: 'A weekly Shadowdark campaign.' },
      { name: 'Dungeon Crawl', description: 'Old-school dungeon delving.' },
    ],
    loading: false,
    loadingMore: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    refetch,
    loadMore,
    ...overrides,
  } as any)
  return { loadMore, refetch }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DirectoryPage />
    </MemoryRouter>,
  )
}

describe('DirectoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
    mockChannels()
    mockStats()
  })

  it('renders one h1, the intro, and the listed games', () => {
    renderPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Games looking for players' })).toBeInTheDocument()
    expect(screen.getByText('Weekly Delves')).toBeInTheDocument()
    expect(screen.getByText('A weekly Shadowdark campaign.')).toBeInTheDocument()
    expect(screen.getByText(/Messages and player details always stay inside the campaign/)).toBeInTheDocument()
  })

  it('never offers anything but sign-in: every card heading links to /login', () => {
    renderPage()

    const links = screen.getAllByRole('link', { name: /Weekly Delves|Dungeon Crawl/ })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/login')
    }
  })

  it('makes links in a listing description tappable without nesting anchors', () => {
    mockChannels({
      channels: [
        {
          name: 'Weekly Delves',
          description: 'Recruiting at https://example.com/recruit — post most days.',
        },
      ],
    })

    const { container } = renderPage()

    const external = screen.getByRole('link', { name: 'https://example.com/recruit' })
    expect(external).toHaveAttribute('href', 'https://example.com/recruit')
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
    // The sign-in anchor must not wrap the description link.
    expect(container.querySelector('a a')).toBeNull()
    expect(screen.getByRole('link', { name: 'Weekly Delves' })).toHaveAttribute('href', '/login')
  })

  it('renders HTML-shaped description text as text, never HTML', () => {
    mockChannels({ channels: [{ name: 'Weekly Delves', description: '<b>not bold</b>' }] })

    const { container } = renderPage()

    expect(screen.getByText('<b>not bold</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })

  it('fires directory_signin_click when a card is clicked', () => {
    renderPage()

    fireEvent.click(screen.getByRole('link', { name: /Weekly Delves/ }))
    expect(trackEvent).toHaveBeenCalledWith('directory_signin_click')
  })

  it('shows a spinner while the list loads', () => {
    mockChannels({ loading: true, channels: [] })

    renderPage()
    expect(screen.getByRole('status', { name: 'Loading games' })).toBeInTheDocument()
  })

  it('keeps the intro and offers Retry when the fetch fails', () => {
    const { refetch } = mockChannels({ error: new Error('down'), channels: [] })

    renderPage()

    // The static copy must survive a failed fetch.
    expect(screen.getByRole('heading', { level: 1, name: 'Games looking for players' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load the games/)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when nothing is listed', () => {
    mockChannels({ channels: [] })

    renderPage()
    expect(screen.getByText('No games listed yet.')).toBeInTheDocument()
  })

  it('hides Load more on the last page and shows an inline error when it fails', () => {
    mockChannels({ hasMore: false })
    const { unmount } = renderPage()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    unmount()

    const { loadMore } = mockChannels({ hasMore: true, loadMoreError: new Error('down') })
    renderPage()

    // Rows already on screen stay put; the failure is an inline row.
    expect(screen.getByText('Weekly Delves')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load more games/)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('offers the app to a signed-in visitor without redirecting them', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)

    renderPage()

    expect(screen.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', '/')
    // Still the public page: the cards are there too.
    expect(screen.getByText('Weekly Delves')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('renders the platform band between the intro and the listings', () => {
    const { container } = renderPage()

    const band = container.querySelector('dl[aria-label="Platform activity"]')
    const listings = screen.getByRole('region', { name: 'Listed games' })
    expect(band).not.toBeNull()
    // The band must precede the listings: it is the first evidence that people
    // are here, not a footnote after the list.
    expect(band!.compareDocumentPosition(listings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('1,200+')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('5 active games · 3 recruiting now · 2 new this week')).toBeInTheDocument()
  })

  it('drops the band silently when the stats fetch fails, leaving the list intact', () => {
    mockStats({ stats: null, loading: false })
    const { refetch } = mockChannels({ error: new Error('down'), channels: [] })

    const { container } = renderPage()

    expect(container.querySelector('dl[aria-label="Platform activity"]')).toBeNull()
    // The list's own error and Retry still work exactly as before.
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load the games/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('bakes only the intro and the loading shell, never a stale list', () => {
    ;(window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ = true
    mockChannels({ loading: true, channels: [] })
    try {
      renderPage()

      // The static shell carries the copy and the same loading markup the
      // client paints first, so hydration matches…
      expect(screen.getByRole('heading', { level: 1, name: 'Games looking for players' })).toBeInTheDocument()
      expect(screen.getByText(/Each listing is written by its Game Master/)).toBeInTheDocument()
      expect(screen.getByRole('status', { name: 'Loading games' })).toBeInTheDocument()
      // …and nothing that could go stale between deploys.
      expect(screen.queryByText('No games listed yet.')).not.toBeInTheDocument()
      expect(screen.queryByText('Weekly Delves')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // The band renders its placeholders in the shell, so the height is
      // reserved — but no count is baked into the static HTML.
      expect(screen.getByText('Games')).toBeInTheDocument()
      expect(screen.queryByText('42')).not.toBeInTheDocument()
    } finally {
      delete (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__
    }
  })
})
