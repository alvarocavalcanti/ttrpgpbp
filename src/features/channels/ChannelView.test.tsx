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

  it('renders loading state', () => {
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
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
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
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()

    // A hook-count mismatch between the loading and loaded renders would throw
    // here (it crashed the whole channel page on every cold load before the fix).
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'finish loading' })) })
    expect(document.querySelector('.animate-spin')).toBeNull()
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
    const promptSpy = vi.spyOn(window, 'prompt')

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

    // The projected member carries the STR:3 attribute, so the stored modifier
    // is reused instead of prompting.
    expect(promptSpy).not.toHaveBeenCalled()
    expect(mockSendDiceRoll).toHaveBeenCalledWith('1d20+3', 'msg1', undefined, undefined)
    promptSpy.mockRestore()
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

  it('renders sidebar menu items in alphabetical order with Members first', () => {
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

    const gmResIdx = items.findIndex(t => t === 'GM Resources')
    const mapIdx = items.findIndex(t => t === 'Map')
    const notifIdx = items.findIndex(t => t === 'Notifications')
    const resIdx = items.findIndex(t => t === 'Resources')
    const rollsIdx = items.findIndex(t => t === 'Rolls')
    const searchIdx = items.findIndex(t => t === 'Search')
    const settingsIdx = items.findIndex(t => t === 'Settings')

    expect(gmResIdx).toBe(0)
    expect(mapIdx).toBeLessThan(notifIdx)
    expect(notifIdx).toBeLessThan(resIdx)
    expect(resIdx).toBeLessThan(rollsIdx)
    expect(rollsIdx).toBeLessThan(searchIdx)
    expect(searchIdx).toBeLessThan(settingsIdx)
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

    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'my reply' } })
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

    expect(screen.getByRole('alert')).toHaveTextContent(/X-Card triggered \(2\)\. Handle the scene outside the chat/)
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
})
