import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AdminChannelView } from './AdminChannelView'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useAdminChannelMessages } from './useAdminChannelMessages'

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn(),
}))

vi.mock('./useAdminChannelMessages', () => ({
  useAdminChannelMessages: vi.fn(),
}))

const baseChannel = {
  id: 'c1', name: 'Strahd', game_system: 'D&D 5e', gm_id: 'u1',
  member_count: 2, created_at: '2026-09-18T10:00:00Z',
  last_message_at: null, gm_display_name: 'Alice',
  human_sender_count: 3, human_message_count: 40,
}

function baseMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    channel_id: 'c1',
    sender_id: 'u1',
    sender_display_name: 'Alice',
    sender_character_name: 'Alicia the Bold',
    content: 'Hello all',
    type: 'regular',
    is_deleted: false,
    whisper_to: null,
    npc_name: null,
    created_at: '2026-09-18T12:00:00Z',
    ...overrides,
  }
}

function baseHook(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    loading: false,
    error: null,
    hasMore: false,
    loadingOlder: false,
    loadOlder: vi.fn(),
    refetch: vi.fn(),
    channel: { ...baseChannel },
    channelLoading: false,
    channelError: false,
    channelMissing: false,
    refetchChannel: vi.fn(),
    members: [],
    membersLoading: false,
    membersError: false,
    refetchMembers: vi.fn(),
    ...overrides,
  }
}

function renderView(path = '/admin/channels/c1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/channels/:id" element={<AdminChannelView />} />
        <Route path="/" element={<div>Home page</div>} />
        <Route path="/admin" element={<div>Admin page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminChannelView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook() as any)
  })

  it('bounds itself to the viewport so the channel header stays put', () => {
    const { container } = renderView()

    // DAMP literals: the route element fills the bounded <main> and lets its
    // panes shrink (min-h-0) so the message list — not the document — scrolls
    // and the channel header stays put. See AppShell + #704.
    const root = container.firstElementChild!
    expect(root).toHaveClass('flex-1')
    expect(root).toHaveClass('min-h-0')
    expect(root).toHaveClass('overflow-hidden')
  })

  it('renders the channel header, read-only banner, and messages', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({ messages: [baseMessage()] }) as any)

    renderView()

    expect(await screen.findByText('Strahd')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Read-only admin view')
    expect(screen.getByText('Hello all')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('renders no composer or message actions', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({ messages: [baseMessage()] }) as any)

    renderView()
    await screen.findByText('Hello all')

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reply/i })).toBeNull()
  })

  it('falls back to character name, then Unknown, for the sender label', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      messages: [
        baseMessage({ id: 'm1', sender_display_name: null }),
        baseMessage({ id: 'm2', sender_display_name: null, sender_character_name: null }),
      ],
    }) as any)

    renderView()

    expect(await screen.findByText('Alicia the Bold')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows type, NPC, whisper, and deleted badges', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      messages: [
        baseMessage({ id: 'm1', type: 'scene', content: 'A dark room.' }),
        baseMessage({ id: 'm2', type: 'npc', npc_name: 'Barkeep', content: 'Welcome.' }),
        baseMessage({ id: 'm3', whisper_to: 'u2', content: 'Psst.' }),
        baseMessage({ id: 'm4', is_deleted: true, content: 'Gone but reviewed.' }),
      ],
    }) as any)

    renderView()

    expect(await screen.findByText('scene')).toBeInTheDocument()
    expect(screen.getByText('NPC: Barkeep')).toBeInTheDocument()
    expect(screen.getByText('Whisper')).toBeInTheDocument()
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    // Deleted content stays visible for safety review, marked by the badge.
    expect(screen.getByText('Gone but reviewed.')).toBeInTheDocument()
  })

  it('calls loadOlder from the Load earlier messages button', async () => {
    const loadOlder = vi.fn()
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      messages: [baseMessage()], hasMore: true, loadOlder,
    }) as any)

    renderView()
    await screen.findByText('Hello all')

    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    expect(loadOlder).toHaveBeenCalledTimes(1)
  })

  it('shows a loading label on the load-earlier button while paging', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      messages: [baseMessage()], hasMore: true, loadingOlder: true,
    }) as any)

    renderView()
    expect(await screen.findByRole('button', { name: 'Loading...' })).toBeDisabled()
  })

  describe('scroll anchoring', () => {
    // jsdom has no layout: scrollHeight reads 0 unless stubbed. Mirror the
    // MessageList scroll tests — one shared scrollTop/scrollHeight pair on the
    // prototype, torn down after each case.
    let scrollTop = 0
    let scrollHeight = 0

    beforeEach(() => {
      scrollTop = 0
      scrollHeight = 0
      Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get: () => scrollHeight,
      })
      Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (v: number) => { scrollTop = v },
      })
    })

    afterEach(() => {
      delete (window.HTMLElement.prototype as any).scrollHeight
      delete (window.HTMLElement.prototype as any).scrollTop
    })

    it('anchors to the newest message at the bottom on load', async () => {
      scrollHeight = 1000
      vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
        messages: [baseMessage({ id: 'm1', channel_id: 'c1' })],
      }) as any)

      renderView()
      await screen.findByText('Hello all')

      expect(screen.getByTestId('admin-channel-scroll')).toHaveProperty('scrollTop', 1000)
    })

    it('preserves the viewport when older messages are prepended', async () => {
      scrollHeight = 1000
      vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
        messages: [baseMessage({ id: 'm2', channel_id: 'c1', content: 'Newer' })],
        hasMore: true,
      }) as any)

      const { rerender } = renderView()
      await screen.findByText('Newer')
      expect(screen.getByTestId('admin-channel-scroll')).toHaveProperty('scrollTop', 1000)

      // The reader scrolls up, then an older page lands above.
      screen.getByTestId('admin-channel-scroll').scrollTop = 600
      fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))

      scrollHeight = 1400
      vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
        messages: [
          baseMessage({ id: 'm1', channel_id: 'c1', content: 'Older' }),
          baseMessage({ id: 'm2', channel_id: 'c1', content: 'Newer' }),
        ],
        hasMore: true,
      }) as any)
      rerender(
        <MemoryRouter initialEntries={['/admin/channels/c1']}>
          <Routes>
            <Route path="/admin/channels/:id" element={<AdminChannelView />} />
            <Route path="/" element={<div>Home page</div>} />
            <Route path="/admin" element={<div>Admin page</div>} />
          </Routes>
        </MemoryRouter>
      )
      await screen.findByText('Older')

      // 400px were added above the viewport; scrollTop grows by that much so
      // the visible messages stay put instead of jumping to the bottom.
      expect(screen.getByTestId('admin-channel-scroll')).toHaveProperty('scrollTop', 1000)
    })

    it('re-anchors to the bottom after a channel switch', async () => {
      scrollHeight = 1000
      // Rows lag the route like the real hook's in-flight fetch: they follow
      // liveChannel, not the URL, until it catches up.
      let liveChannel = 'c1'
      vi.mocked(useAdminChannelMessages).mockImplementation((channelId: string | undefined) => baseHook({
        channel: { ...baseChannel, id: channelId ?? 'c1', name: channelId === 'c2' ? 'Harbor' : 'Strahd' },
        messages: liveChannel === 'c2'
          ? [baseMessage({ id: 'm9', channel_id: 'c2', content: 'C2 newest' })]
          : [baseMessage({ id: 'm1', channel_id: 'c1', content: 'C1 newest' })],
      }) as any)

      const router = createMemoryRouter(
        [{ path: '/admin/channels/:id', element: <AdminChannelView /> }],
        { initialEntries: ['/admin/channels/c1'] },
      )
      render(<RouterProvider router={router} />)
      await screen.findByText('C1 newest')
      expect(screen.getByTestId('admin-channel-scroll')).toHaveProperty('scrollTop', 1000)

      // The reader scrolls up, then switches channels while the old rows are
      // still showing: the stale list must not claim the anchor.
      screen.getByTestId('admin-channel-scroll').scrollTop = 200
      await act(async () => { await router.navigate('/admin/channels/c2') })
      expect(screen.getByTestId('admin-channel-scroll')).toHaveProperty('scrollTop', 200)

      // The new channel's page arrives and pins to the bottom.
      liveChannel = 'c2'
      await act(async () => { await router.revalidate() })
      await screen.findByText('C2 newest')
      expect(screen.getByTestId('admin-channel-scroll')).toHaveProperty('scrollTop', 1000)
    })
  })

  it('shows an empty state when the channel has no messages', async () => {
    renderView()
    expect(await screen.findByText('No messages yet.')).toBeInTheDocument()
  })

  it('shows an error with Retry that refetches', async () => {
    const refetch = vi.fn()
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      error: new Error('DB down'), refetch,
    }) as any)

    renderView()
    expect(await screen.findByText("Couldn't load messages.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('keeps loaded messages visible under a page error', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      messages: [baseMessage()], error: new Error('DB down'),
    }) as any)

    renderView()
    expect(await screen.findByText("Couldn't load messages.")).toBeInTheDocument()
    expect(screen.getByText('Hello all')).toBeInTheDocument()
  })

  it('redirects non-admins to home and issues no channel fetch', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })

    renderView()
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(vi.mocked(useAdminChannelMessages)).toHaveBeenCalledWith(undefined)
  })

  it('shows a spinner while admin status loads', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: true })

    renderView()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows a not-found state for an unknown channel', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      channel: null, channelMissing: true,
    }) as any)

    renderView()
    expect(await screen.findByText('Channel not found.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to admin' })).toHaveAttribute('href', '/admin')
  })

  it('shows an error with Retry when the channel fails to load', async () => {
    const refetchChannel = vi.fn()
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      channel: null, channelError: true, refetchChannel,
    }) as any)

    renderView()
    expect(await screen.findByText("Couldn't load this channel.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchChannel).toHaveBeenCalledTimes(1)
  })

  it('links back to the admin console', async () => {
    renderView()
    expect(await screen.findByRole('link', { name: 'Back to admin' })).toHaveAttribute('href', '/admin')
  })

  it('lists the channel players with GM, active-player, and blocked badges', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      members: [
        { user_id: 'u1', display_name: 'Alice', character_name: 'Alicia the Bold', is_blocked: false, is_active_player: false },
        { user_id: 'u2', display_name: 'Bob', character_name: 'Bobby', is_blocked: false, is_active_player: true },
        { user_id: 'u3', display_name: 'Mallory', character_name: 'Mal', is_blocked: true, is_active_player: false },
      ],
    }) as any)

    renderView()

    expect(await screen.findByText('Players (2)')).toBeInTheDocument()
    expect(screen.getByText('Alicia the Bold')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bobby')).toBeInTheDocument()
    expect(screen.getByText('GM')).toBeInTheDocument()
    expect(screen.getByText('Active player')).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('lists the Players roster with the GM first, then players by character name (#571)', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      channel: { ...baseChannel, gm_id: 'u2' },
      members: [
        { user_id: 'u1', display_name: 'Alice', character_name: 'Alicia the Bold', is_blocked: false, is_active_player: false },
        { user_id: 'u2', display_name: 'Zed', character_name: 'Zed', is_blocked: false, is_active_player: false },
        { user_id: 'u3', display_name: 'Bob', character_name: 'Bobby', is_blocked: false, is_active_player: true },
      ],
    }) as any)

    renderView()

    expect(await screen.findByText('Players (2)')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    const names = items.map(li => (li.querySelector('span') as HTMLElement).textContent)
    expect(names).toEqual(['Zed', 'Alicia the Bold', 'Bobby'])
  })

  it('hides a display name identical to the character name', async () => {    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      members: [
        { user_id: 'u2', display_name: 'Bobby', character_name: 'Bobby', is_blocked: false, is_active_player: false },
      ],
    }) as any)

    renderView()

    expect(await screen.findByText('Bobby')).toBeInTheDocument()
    expect(screen.queryAllByText('Bobby')).toHaveLength(1)
  })

  it('shows an empty state when the channel has no players', async () => {
    renderView()
    expect(await screen.findByText('No players yet.')).toBeInTheDocument()
  })

  it('shows a loading state while the roster loads', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({ membersLoading: true }) as any)

    renderView()
    expect(await screen.findByText('Loading players…')).toBeInTheDocument()
  })

  it('shows a roster error with Retry that refetches members', async () => {
    const refetchMembers = vi.fn()
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      membersError: true, refetchMembers,
    }) as any)

    renderView()
    expect(await screen.findByText("Couldn't load players.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchMembers).toHaveBeenCalledTimes(1)
  })

  it('shows no roster when the channel is missing', async () => {
    vi.mocked(useAdminChannelMessages).mockReturnValue(baseHook({
      channel: null, channelMissing: true,
    }) as any)

    renderView()
    await screen.findByText('Channel not found.')

    expect(screen.queryByText(/Players \(/)).toBeNull()
  })
})
