import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { ChannelView } from './ChannelView'
import { useChannel } from './useChannel'
import { useMessages } from '../chat/useMessages'
import { useSafetyCardEvents } from './useSafetyCardEvents'
import { usePushNotifications } from '../auth/usePushNotifications'
import { notifyChannelRead } from '../../lib/channelRead'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider } from '../../contexts/ToastContext'

vi.mock('./useChannel', () => ({
  useChannel: vi.fn()
}))

vi.mock('../chat/useMessages', () => ({
  useMessages: vi.fn()
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({ user: { id: 'user1' } })
}))

vi.mock('../auth/usePushNotifications', () => ({
  usePushNotifications: vi.fn()
}))

vi.mock('../../lib/channelRead', () => ({
  notifyChannelRead: vi.fn()
}))

vi.mock('../search/SearchModal', () => ({
  SearchModal: ({ onClose, onJumpToMessage }: any) => (
    <div data-testid="search-modal">
      <button type="button" onClick={onClose}>Close Search</button>
      <button type="button" onClick={() => { onJumpToMessage('msg1'); onClose(); }}>Jump to msg1</button>
    </div>
  )
}))

vi.mock('./useSafetyCardEvents', () => ({
  useSafetyCardEvents: vi.fn()
}))

const useMessagesMock = () => (useMessages as unknown as () => any)()

describe('ChannelView search functionality', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.mocked(usePushNotifications).mockReturnValue({ preferences: { badge_enabled: true } } as any)
    vi.mocked(useSafetyCardEvents).mockReturnValue({
      alertActive: false,
      alertCount: 0,
      dismissAlert: vi.fn(),
      triggerXCard: vi.fn()
    } as any)
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    vi.mocked(useMessages).mockReturnValue({
      messages: [{ id: 'msg1', content: 'test', type: 'regular', sender_id: 'user1' }],
      reactions: {},
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)
  })

  it('toggles search modal', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    // Initially modal is not there
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument()

    // Click search button
    fireEvent.click(screen.getByText('Search'))
    expect(screen.getByTestId('search-modal')).toBeInTheDocument()

    // Click close in the mock modal
    fireEvent.click(screen.getByText('Close Search'))
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument()
  })

  it('truncates a long channel name without pushing header controls off-screen', () => {
    // Regression test for #369: the header name container must allow its
    // truncate class to shrink, otherwise an 80-char name (the DB max) pushes
    // the header tool buttons out of the viewport.
    const longName = 'A'.repeat(80)
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: longName },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const heading = screen.getByRole('heading', { level: 2, name: longName })
    expect(heading).toHaveClass('truncate')

    // The flex container holding the back link + name must be shrinkable so
    // the truncate can engage and the tool buttons stay on screen.
    const nameContainer = heading.parentElement as HTMLElement
    expect(nameContainer).toHaveClass('min-w-0')

    // Header controls remain rendered and accessible.
    expect(screen.getByRole('button', { name: 'Toggle sidebar menu' })).toBeInTheDocument()
    // Search + roll history moved into the sidebar menu (issue #382).
    expect(screen.queryByRole('button', { name: 'Search messages' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Roll history' })).not.toBeInTheDocument()
  })

  it('toggles help modal', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByRole('dialog', { name: 'Channel help' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Help'))
    expect(screen.getByRole('dialog', { name: 'Channel help' })).toBeInTheDocument()
  })

  it('handles jump to message', () => {    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Search'))
    
    // Clicking jump calls handleJumpToMessage which sets highlightMessageId
    // We mock SearchModal, so we just check it doesn't crash and closes modal
    fireEvent.click(screen.getByText('Jump to msg1'))
    
    // Modal should close
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument()
  })

  it('renders header-first loading state with message skeletons', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: null,
      members: [],
      loading: true,
      error: null,
      isGM: false,
      myMemberInfo: undefined,
      refetch: vi.fn()
    } as any)

    const { container } = render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    // Progressive paint: header (with back link + skeleton name) is present
    // while loading, plus 3 skeleton message bubbles — no blank screen.
    expect(screen.getByRole('link', { name: 'Back to Lobby' })).toBeInTheDocument()
    expect(screen.getByTestId('channel-name-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('message-skeletons')).toBeInTheDocument()
    expect(screen.getByTestId('message-skeletons').children).toHaveLength(3)
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('shows the real channel name in the header while only messages are loading', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Cached Channel', gm_id: 'user1', is_archived: false, game_system: 'generic' },
      members: [],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      refetch: vi.fn()
    } as any)
    vi.mocked(useMessages).mockReturnValue({
      messages: [],
      reactions: {},
      loading: true,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('Cached Channel')).toBeInTheDocument()
    expect(screen.getByTestId('message-skeletons')).toBeInTheDocument()
    expect(screen.queryByTestId('channel-name-skeleton')).not.toBeInTheDocument()
  })

  it('opens search and roll history from the sidebar menu', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByTestId('search-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Close Search'))

    fireEvent.click(screen.getByRole('button', { name: 'Rolls' }))
    expect(screen.getByRole('dialog', { name: 'Roll History' })).toBeInTheDocument()
  })

  it('groups sidebar tools into Table and GM Tools sections for players', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const menu = screen.getByTestId('sidebar-menu')
    expect(screen.getByText('Table')).toBeInTheDocument()
    expect(screen.queryByText('GM Tools')).not.toBeInTheDocument()
    expect(menu).toHaveTextContent('Rolls')
    expect(menu).toHaveTextContent('Search')
    expect(menu).not.toHaveTextContent('Settings')
  })

  it('shows the GM Tools section for the GM', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', gm_id: 'user1', is_archived: false, game_system: 'generic' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1', id: 'm1', character_name: 'Hero' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('GM Tools')).toBeInTheDocument()
    const menu = screen.getByTestId('sidebar-menu')
    expect(menu).toHaveTextContent('NPCs')
    expect(menu).toHaveTextContent('Active Player')
    expect(menu).toHaveTextContent('Settings')
  })

  it('does not crash when the loading render transitions to loaded (stable hook order)', () => {
    const shared = { isLoading: true }
    const channel = {
      id: 'c1',
      name: 'Hooked Channel',
      gm_id: 'user1',
      avatar_url: null,
      is_archived: false,
      game_system: 'generic',
      status_text: null
    }
    vi.mocked(useChannel).mockImplementation(() => ({
      channel: shared.isLoading ? null : channel,
      members: [],
      loading: shared.isLoading,
      error: null,
      isGM: !shared.isLoading,
      myMemberInfo: undefined,
      gmOnlyResourcesUrl: null,
      lastReadAt: null,
      refetch: vi.fn()
    }) as any)
    vi.mocked(useMessages).mockImplementation(() => ({
      messages: [],
      reactions: {},
      loading: shared.isLoading,
      error: null,
      hasMore: false,
      loadingOlder: false,
      loadOlder: vi.fn(),
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn(),
      removeReaction: vi.fn(),
      retryMessage: vi.fn(),
      removePendingMessage: vi.fn()
    }) as any)

    function Harness() {
      const [isLoading, setIsLoading] = useState(true)
      shared.isLoading = isLoading
      return (
        <ToastProvider>
          <MemoryRouter initialEntries={['/channel/c1']}>
            <Routes>
              <Route path="/channel/:id" element={<ChannelView />} />
            </Routes>
          </MemoryRouter>
          <button type="button" onClick={() => setIsLoading(false)}>finish loading</button>
        </ToastProvider>
      )
    }

    render(<Harness />)
    expect(document.querySelector('[data-testid="message-skeletons"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="channel-name-skeleton"]')).not.toBeNull()

    // A hook-count mismatch between the loading and loaded renders would throw
    // here (it crashed the whole channel page on every cold load before the fix).
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'finish loading' })) })
    expect(document.querySelector('[data-testid="message-skeletons"]')).toBeNull()
    expect(screen.getByText('Hooked Channel')).toBeInTheDocument()
  })

  it('renders an error screen with retry instead of redirecting', () => {
    const refetch = vi.fn()
    vi.mocked(useChannel).mockReturnValue({
      channel: null,
      members: [],
      loading: false,
      error: new Error('Error'),
      isGM: false,
      myMemberInfo: undefined,
      refetch
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText(/Could not load this channel/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('renders a banner when messages fail to load', () => {
    vi.mocked(useMessages).mockReturnValue({
      messages: [],
      reactions: {},
      loading: false,
      error: new Error('Failed to fetch messages'),
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load messages/)
  })

  it('projects channel member attributes so ability checks reuse the stored modifier', async () => {
    const mockSendDiceRoll = vi.fn()
    vi.mocked(useMessages).mockReturnValue({
      messages: [{ id: 'msg1', content: '[STR Check](check:STR)', type: 'regular', sender_id: 'user1', created_at: new Date().toISOString() }],
      reactions: {},
      loading: false,
      error: null,
      hasMore: false,
      loadingOlder: false,
      loadOlder: vi.fn(),
      sendMessage: vi.fn(),
      sendDiceRoll: mockSendDiceRoll,
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', gm_id: 'gm1', game_system: 'shadowdark' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero', attributes: { STR: 3 } }],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const checkBtn = await screen.findByRole('button', { name: /STR Check/ })
    fireEvent.click(checkBtn)

    // The projected member carries the STR:3 attribute, so the check sheet
    // pre-fills the modifier from the profile and rolls with it.
    expect(screen.getByLabelText('Modifier')).toHaveValue('3')
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockSendDiceRoll).toHaveBeenCalledWith('1d20+3', 'msg1', undefined, undefined)
  })

  it('shows an archived banner and hides the composer for archived channels', async () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', is_archived: true, game_system: 'none' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      refetch: vi.fn()
    } as any)

    vi.mocked(useMessages).mockReturnValue({
      messages: [],
      reactions: {},
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(await screen.findByText(/archived and read-only/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Scene Description')).not.toBeInTheDocument()
  })

  it('renders new messages divider from myMemberInfo.last_read_at', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1', last_read_at: '2023-01-01T12:00:00Z' },
      refetch: vi.fn()
    } as any)

    vi.mocked(useMessages).mockReturnValue({
      messages: [
        { id: 'old', content: 'old', type: 'regular', sender_id: 'other', created_at: '2023-01-01T10:00:00Z' },
        { id: 'new', content: 'new', type: 'regular', sender_id: 'other', created_at: '2023-01-01T15:00:00Z' }
      ],
      reactions: {},
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument()
  })

  it('keeps the new messages divider when last_read_at echo races the open (regression #213)', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: false,
      lastReadAt: '2023-01-01T12:00:00Z',
      myMemberInfo: { user_id: 'user1', last_read_at: '2023-01-01T18:00:00Z' },
      refetch: vi.fn()
    } as any)

    vi.mocked(useMessages).mockReturnValue({
      messages: [
        { id: 'old', content: 'old', type: 'regular', sender_id: 'other', created_at: '2023-01-01T10:00:00Z' },
        { id: 'new', content: 'new', type: 'regular', sender_id: 'other', created_at: '2023-01-01T15:00:00Z' }
      ],
      reactions: {},
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument()
  })

  it('does not render new messages divider when the user sends their own message', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1', last_read_at: '2023-01-01T12:00:00Z' },
      refetch: vi.fn()
    } as any)

    vi.mocked(useMessages).mockReturnValue({
      messages: [
        { id: 'old', content: 'old', type: 'regular', sender_id: 'other', created_at: '2023-01-01T10:00:00Z' },
        { id: 'mine', content: 'mine', type: 'regular', sender_id: 'user1', created_at: '2023-01-01T15:00:00Z' }
      ],
      reactions: {},
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument()
  })

  it('toggles settings modal for GM', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1', character_name: 'Hero' },
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getByText('Channel Settings')).toBeInTheDocument()
  })

  it('toggles rolls modal', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Rolls'))
    expect(screen.getByText('Roll History')).toBeInTheDocument()
  })

  it('renders sidebar grouped into Table first, then GM Tools', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', map_url: 'https://map.com', resources_url: 'https://res.com' },
      members: [],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: 'https://gm-secret.com',
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const sidebar = screen.getByTestId('sidebar-menu')
    const items = Array.from(sidebar.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim())
      .filter(Boolean)

    // Table section (everyone) comes first, GM Tools (GM-only) after.
    expect(items).toEqual([
      'Map',
      'Rolls',
      'Search',
      'Notifications',
      'Resources',
      'Safety Tools',
      'Help',
      'GM Resources',
      'NPCs',
      'Active Player',
      'Settings'
    ])
    expect(screen.getByText('Table')).toBeInTheDocument()
    expect(screen.getByText('GM Tools')).toBeInTheDocument()
  })

  it('does not show Settings or GM Resources in sidebar for non-GM', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: 'https://gm-secret.com',
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const sidebar = screen.getByTestId('sidebar-menu')
    const items = Array.from(sidebar.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim())

    expect(items).toContain('Notifications')
    expect(items).not.toContain('Settings')
    expect(items).not.toContain('GM Resources')
  })

  it('shows the NPCs sidebar item and opens the management modal for GMs', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const sidebar = screen.getByTestId('sidebar-menu')
    const items = Array.from(sidebar.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim())

    expect(items).toContain('NPCs')
    fireEvent.click(screen.getByText('NPCs'))
    expect(screen.getByRole('dialog', { name: 'Manage NPCs' })).toBeInTheDocument()
  })

  it('applies dark-mode classes to the NPCs sidebar item', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const npcBtn = Array.from(screen.getByTestId('sidebar-menu').querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'NPCs')!
    expect(npcBtn).toHaveClass('text-gray-700', 'dark:text-gray-300', 'dark:hover:bg-gray-700')
  })

  it('does not show the NPCs sidebar item for non-GMs', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const sidebar = screen.getByTestId('sidebar-menu')
    const items = Array.from(sidebar.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim())

    expect(items).not.toContain('NPCs')
  })

  it('shows the Active Player sidebar item and opens the modal for GMs', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [{ user_id: 'u2', character_name: 'Hero', is_active_player: false }],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const sidebar = screen.getByTestId('sidebar-menu')
    const items = Array.from(sidebar.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim())

    expect(items).toContain('Active Player')
    fireEvent.click(screen.getByText('Active Player'))
    expect(screen.getByRole('dialog', { name: 'Active Player' })).toBeInTheDocument()
  })

  it('does not show the Active Player sidebar item for non-GMs', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const sidebar = screen.getByTestId('sidebar-menu')
    const items = Array.from(sidebar.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim())

    expect(items).not.toContain('Active Player')
  })

  it('shows GM Resources link to GM when set', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' },
      members: [],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { user_id: 'user1' },
      gmOnlyResourcesUrl: 'https://gm-secret.com',
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const link = screen.getByText('GM Resources')
    expect(link).toHaveAttribute('href', 'https://gm-secret.com')
  })

  it('shows access-removed state when the current user is blocked', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: null,
      members: [{ user_id: 'user1', is_blocked: true, character_name: 'Hero' }],
      loading: false,
      error: new Error('RLS blocked'),
      isGM: false,
      myMemberInfo: { user_id: 'user1', is_blocked: true },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('Access Removed')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-menu')).not.toBeInTheDocument()
  })

  it('starts a reply from a message and sends reply_to', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByLabelText('Reply'))
    expect(screen.getByText(/Replying to Hero/)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'my reply' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(useMessagesMock().sendMessage).toHaveBeenCalledWith(expect.objectContaining({ reply_to: 'msg1', content: 'my reply' }))
    })
    // Reply bar clears after send
    await waitFor(() => {
      expect(screen.queryByText(/Replying to Hero/)).not.toBeInTheDocument()
    })
  })

  it('cancels a reply and clears the reply bar', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByLabelText('Reply'))
    fireEvent.click(screen.getByLabelText('Cancel reply'))
    expect(screen.queryByText(/Replying to Hero/)).not.toBeInTheDocument()
  })

  it('adds a reaction when not already reacted', async () => {
    vi.mocked(useMessages).mockReturnValue({
      messages: [{ id: 'msg1', content: 'test', type: 'regular', sender_id: 'user1' }],
      reactions: { msg1: [{ emoji: '👍', count: 1, hasReacted: false }] },
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Reaction 👍, 1/ }))
    await waitFor(() => {
      expect(useMessagesMock().addReaction).toHaveBeenCalledWith('msg1', '👍')
    })
  })

  it('removes a reaction when already reacted', async () => {
    vi.mocked(useMessages).mockReturnValue({
      messages: [{ id: 'msg1', content: 'test', type: 'regular', sender_id: 'user1' }],
      reactions: { msg1: [{ emoji: '👍', count: 1, hasReacted: true }] },
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Reaction 👍, 1/ }))
    await waitFor(() => {
      expect(useMessagesMock().removeReaction).toHaveBeenCalledWith('msg1', '👍')
    })
  })

  it('renders the channel avatar in the header when set', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', avatar_url: 'https://img/av.jpg' },
      members: [],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { user_id: 'user1' },
      refetch: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const avatar = screen.getByTestId('channel-header-avatar')
    expect(avatar.tagName).toBe('IMG')
    expect(avatar).toHaveAttribute('src', 'https://img/av.jpg')
  })

  it('falls back to the channel initial in the header when no avatar is set', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const avatar = screen.getByTestId('channel-header-avatar')
    expect(avatar.tagName).toBe('DIV')
    expect(avatar).toHaveTextContent('T')
  })

  it('shows the X-Card alert banner for the GM and dismisses it', () => {
    const mockDismiss = vi.fn()
    vi.mocked(useSafetyCardEvents).mockReturnValue({
      alertActive: true,
      alertCount: 2,
      dismissAlert: mockDismiss,
      triggerXCard: vi.fn()
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/X-Card triggered \(2\)\./)
    fireEvent.click(screen.getByLabelText('Dismiss X-Card alert'))
    expect(mockDismiss).toHaveBeenCalled()
  })

  it('does not show the X-Card alert banner when inactive', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('dismisses the channel notifications once the channel is read', async () => {
    let onRead: (() => void) | undefined
    vi.mocked(useChannel).mockImplementation((_id: string | undefined, cb?: () => void) => {
      onRead = cb
      return {
        channel: { id: 'c1', name: 'Test Channel' },
        members: [{ user_id: 'user1', is_active_player: true, character_name: 'Hero' }],
        loading: false,
        error: null,
        isGM: false,
        myMemberInfo: { user_id: 'user1' },
        refetch: vi.fn()
      } as any
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await screen.findByText('Test Channel')
    act(() => onRead?.())

    await waitFor(() => {
      expect(notifyChannelRead).toHaveBeenCalledWith('c1', 'user1', true)
    })
  })

  it('replaces the channel entry when returning to lobby so back does not re-enter the channel', () => {
    function BackProbe() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate(-1)} data-testid="back-probe">
          back
        </button>
      )
    }

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
            <Route path="/" element={<BackProbe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByLabelText('Back to Lobby'))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-probe'))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()
  })

  describe('edge-swipe sidebar', () => {
    const swipe = (type: 'touchstart' | 'touchend', x: number, y = 200) => {
      const event = new Event(type, { bubbles: true }) as unknown as TouchEvent
      Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: y }] })
      act(() => {
        window.dispatchEvent(event)
      })
    }

    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    })

    it('opens the sidebar from a right-edge swipe', () => {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/channel/c1']}>
            <Routes>
              <Route path="/channel/:id" element={<ChannelView />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      // Closed: sidebar translated off-screen, no overlay.
      expect(screen.queryByTestId('sidebar-overlay')).not.toBeInTheDocument()

      swipe('touchstart', 380)
      swipe('touchend', 260)

      expect(screen.getByTestId('sidebar-overlay')).toBeInTheDocument()
    })

    it('closes the sidebar from a rightward swipe', () => {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/channel/c1']}>
            <Routes>
              <Route path="/channel/:id" element={<ChannelView />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      swipe('touchstart', 380)
      swipe('touchend', 260)
      expect(screen.getByTestId('sidebar-overlay')).toBeInTheDocument()

      swipe('touchstart', 100)
      swipe('touchend', 220)
      expect(screen.queryByTestId('sidebar-overlay')).not.toBeInTheDocument()
    })

    it('ignores swipes that start mid-screen', () => {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/channel/c1']}>
            <Routes>
              <Route path="/channel/:id" element={<ChannelView />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      swipe('touchstart', 100)
      swipe('touchend', -20)
      expect(screen.queryByTestId('sidebar-overlay')).not.toBeInTheDocument()
    })
  })
})

describe('ChannelView edit-character deep link (#408)', () => {
  it('opens the character editor with the viewer member id from a check-link deep link', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', game_system: 'shadowdark' },
      members: [{ id: 'm1', user_id: 'user1', is_active_player: true, character_name: 'Hero', attributes: {} }],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: { id: 'm1', user_id: 'user1', character_name: 'Hero' },
      gmOnlyResourcesUrl: null,
      refetch: vi.fn()
    } as any)

    vi.mocked(useMessages).mockReturnValue({
      messages: [{ id: 'msg1', content: '[DEX Check](check:DEX)', type: 'scene', sender_id: 'user1', created_at: new Date().toISOString() }],
      reactions: {},
      loading: false,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendDiceRoll: vi.fn(),
      addReaction: vi.fn().mockResolvedValue(undefined),
      removeReaction: vi.fn().mockResolvedValue(undefined)
    } as any)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/channel/c1']}>
          <Routes>
            <Route path="/channel/:id" element={<ChannelView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('DEX Check'))
    fireEvent.click(screen.getByText('Set it in your character sheet'))

    // The editor must open for the viewer's member row (id closed over by the
    // stable onEditCharacter callback — a regression here silently no-ops or
    // sets editingMemberId to undefined).
    expect(screen.getByLabelText('Character Name')).toHaveValue('Hero')
  })
})
