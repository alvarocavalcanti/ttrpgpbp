import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GameDetailPage } from './GameDetailPage'
import { useAuth } from '../auth/useAuth'
import { usePublicChannelAnonDetail } from './usePublicChannelAnonDetail'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('./usePublicChannelAnonDetail', () => ({ usePublicChannelAnonDetail: vi.fn() }))
vi.mock('../channels/PublicListingDetail', () => ({
  PublicListingDetail: ({ channelId }: { channelId: string }) => (
    <div data-testid="listing-detail" data-channel={channelId} />
  ),
}))

const anonDetail = {
  name: 'Shared Delves',
  game_system: 'shadowdark',
  description: 'A weekly Shadowdark campaign.',
  constraints: 'Post most days.',
  application_prompt: 'Why join us?',
  gm_display_name: 'Aria',
}

function mockDetail(overrides: Record<string, unknown> = {}) {
  const refetch = vi.fn()
  vi.mocked(usePublicChannelAnonDetail).mockReturnValue({
    detail: anonDetail,
    loading: false,
    notFound: false,
    error: null,
    refetch,
    ...overrides,
  } as never)
  return { refetch }
}

function renderPage(path = '/game/abc') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/game/:id" element={<GameDetailPage />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/directory" element={<div data-testid="directory-page" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GameDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as never)
    mockDetail()
  })

  it('shows the GM-authored listing copy to a signed-out visitor', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Shared Delves' })).toBeInTheDocument()
    expect(screen.getByText('A weekly Shadowdark campaign.')).toBeInTheDocument()
    expect(screen.getByText('Post most days.')).toBeInTheDocument()
    expect(screen.getByText('Why join us?')).toBeInTheDocument()
    expect(screen.getByText(/Run by Aria/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to apply' })).toBeInTheDocument()
    // No apply form for a signed-out visitor.
    expect(screen.queryByLabelText('Character name')).not.toBeInTheDocument()
  })

  it('sends the visitor to sign-in with the game as the post-login destination', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to apply' }))

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(sessionStorage.getItem('auth_redirect')).toBe('/game/abc')
  })

  it('holds the page while the session resolves and skips the anon fetch', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as never)

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading game' })).toBeInTheDocument()
    expect(vi.mocked(usePublicChannelAnonDetail)).toHaveBeenCalledWith('abc', { enabled: false })
  })

  it('renders the signed-in detail instead of the marketing copy', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as never)

    renderPage()

    expect(screen.getByTestId('listing-detail')).toHaveAttribute('data-channel', 'abc')
    expect(screen.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Sign in to apply' })).not.toBeInTheDocument()
    expect(vi.mocked(usePublicChannelAnonDetail)).toHaveBeenCalledWith('abc', { enabled: false })
  })

  it('shows a plain not-found state for a game no longer listed or an unknown id', () => {
    mockDetail({ detail: null, notFound: true })

    renderPage()

    expect(screen.getByRole('heading', { name: "This game isn't listed." })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse games looking for players' })).toHaveAttribute(
      'href',
      '/directory',
    )
  })

  it('offers Retry when the listing fetch fails', () => {
    const { refetch } = mockDetail({ detail: null, error: new Error('down') })

    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load this game/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner while the anon listing loads', () => {
    mockDetail({ detail: null, loading: true })

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading game' })).toBeInTheDocument()
  })

  it('treats the pre-fetch frame after auth resolves as loading, not not-found', () => {
    // The anon hook is disabled while auth resolves, then enables with an empty
    // state for one render; the not-listed card must not flash.
    mockDetail({ detail: null, loading: false, notFound: false, error: null })

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading game' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "This game isn't listed." })).not.toBeInTheDocument()
  })

  it('marks the page noindex so /directory stays the indexed surface', () => {
    renderPage()

    const robots = document.querySelector('meta[name="robots"]')
    expect(robots).toHaveAttribute('content', 'noindex')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  })
})
