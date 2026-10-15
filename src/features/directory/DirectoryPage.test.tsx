import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DirectoryPage } from './DirectoryPage'
import { useAuth } from '../auth/useAuth'
import { usePublicChannelsAnon } from './usePublicChannelsAnon'
import { trackEvent } from '../../lib/analytics'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('./usePublicChannelsAnon', () => ({ usePublicChannelsAnon: vi.fn() }))
vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

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
  })

  it('renders one h1, the intro, and the listed games', () => {
    renderPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Games looking for players' })).toBeInTheDocument()
    expect(screen.getByText('Weekly Delves')).toBeInTheDocument()
    expect(screen.getByText('A weekly Shadowdark campaign.')).toBeInTheDocument()
    expect(screen.getByText(/Messages and player details always stay inside the campaign/)).toBeInTheDocument()
  })

  it('never offers anything but sign-in: every card links to /login', () => {
    renderPage()

    const links = screen.getAllByRole('link', { name: /Weekly Delves|Dungeon Crawl/ })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/login')
    }
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
    } finally {
      delete (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__
    }
  })
})
