import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Lobby } from './Lobby'
import { useChannels } from './useChannels'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { usePushNotifications } from '../auth/usePushNotifications'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

vi.mock('./useChannels', () => ({
  useChannels: vi.fn()
}))

vi.mock('./CreateChannelModal', () => ({
  CreateChannelModal: vi.fn(() => <div data-testid="create-modal"><h2>Create a New Channel</h2></div>)
}))

vi.mock('../auth/usePushNotifications', () => ({
  usePushNotifications: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('../../hooks/useAppSetting', () => ({
  useAppSetting: vi.fn().mockReturnValue({ value: 10, loading: false, error: null, refresh: vi.fn() })
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, profile: null })
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() })
}))

describe('Lobby', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: true } as any
    } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as any)
  })

  it('renders loading state', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: true,
      error: null,
    })

    const { container } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders empty state when no channels exist', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByText("You haven't joined any channels yet.")).toBeInTheDocument()
  })

  it('empty state offers create-channel and invite-link paths', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByTestId('empty-lobby-create')).toBeInTheDocument()
    expect(screen.getByLabelText('Paste an invite link')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('empty-lobby-create'))
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
  })

  it('empty state rejects an invalid invite link', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    fireEvent.change(screen.getByLabelText('Paste an invite link'), { target: { value: 'not-a-link' } })
    fireEvent.submit(screen.getByLabelText('Paste an invite link').closest('form')!)

    expect(screen.getByRole('alert')).toHaveTextContent(/invite link/i)
  })

  it('empty state navigates to the join page from a pasted invite link', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/join/:id" element={<div data-testid="join-page" />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.change(
      screen.getByLabelText('Paste an invite link'),
      { target: { value: 'https://rolebypost.app/join/123e4567-e89b-12d3-a456-426614174000' } }
    )
    fireEvent.submit(screen.getByLabelText('Paste an invite link').closest('form')!)

    expect(screen.getByTestId('join-page')).toBeInTheDocument()
  })

  it('renders error state when channels fail to load', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: new Error('DB down')
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load channels/)
  })

  it('renders channels correctly with unread counts', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { 
          id: '1', 
          name: 'My Channel', 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any
      ],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByText('My Channel')).toBeInTheDocument()
    // No last message yet → placeholder preview.
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    expect(screen.getByText('5 new')).toBeInTheDocument()
  })

  it('shows a short timestamp and a stripped message preview per channel', () => {
    const today = new Date()
    const hh = String(today.getHours()).padStart(2, '0')
    const mi = String(today.getMinutes()).padStart(2, '0')

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        // Same-day message → HH:MM; preview has markdown stripped.
        {
          id: '1',
          name: 'Today',
          last_message_at: today.toISOString(),
          last_message_preview: 'Roll a **d20** and _win_',
          member: { character_name: 'Hero' },
        } as any,
        // Older message → DD/MM/YYYY.
        {
          id: '2',
          name: 'Old',
          last_message_at: '2020-05-04T10:00:00Z',
          last_message_preview: 'The tale begins...',
          member: { character_name: 'Hero' },
        } as any,
      ],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    expect(screen.getByText(`${hh}:${mi}`)).toBeInTheDocument()
    expect(screen.getByText('Roll a d20 and win')).toBeInTheDocument()
    expect(screen.getByText('04/05/2020')).toBeInTheDocument()
    expect(screen.getByText('The tale begins...')).toBeInTheDocument()
  })
  it('truncates a long channel name without pushing the unread badge out of the row', () => {
    // Regression test for #369: the row's name container must allow its
    // truncate class to shrink, otherwise an 80-char name (the DB max) pushes
    // the badge and role pills out of the viewport.
    const longName = 'A'.repeat(80)
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: longName,
          gm_id: 'gm-1',
          member: { character_name: 'Hero' },
          unread_count: 5
        } as any
      ],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const nameEl = screen.getByText(longName)
    expect(nameEl).toHaveClass('truncate')

    // The flex container holding avatar + name must be shrinkable so the
    // truncate can engage and the badge/pills stay on screen.
    const nameContainer = nameEl.parentElement as HTMLElement
    expect(nameContainer).toHaveClass('min-w-0')

    expect(screen.getByText('5 new')).toBeInTheDocument()
    expect(screen.getByText('Player')).toBeInTheDocument()
  })

  it('hides unread counts if badge_enabled is false', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: false } as any
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { 
          id: '1', 
          name: 'My Channel', 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any
      ],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.queryByText('5 new')).not.toBeInTheDocument()
  })

  it('updates app badge correctly based on unread counts', () => {
    vi.stubGlobal('navigator', {
      setAppBadge: vi.fn().mockResolvedValue(true),
      clearAppBadge: vi.fn().mockResolvedValue(true)
    })

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { 
          id: '1', 
          name: 'My One', 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any,
        { 
          id: '2', 
          name: 'My Two', 
          member: { character_name: 'Hero2' },
          unread_count: 2
        } as any
      ],
      loading: false,
      error: null,
    })

    const { unmount } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(navigator.setAppBadge).toHaveBeenCalledWith(7)

    // Clear badge when no unread count
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { 
          id: '1', 
          name: 'My One', 
          member: { character_name: 'Hero' },
          unread_count: 0 
        } as any
      ],
      loading: false,
      error: null,
    })

    unmount()
    render(<Lobby />, { wrapper: MemoryRouter })
    expect(navigator.clearAppBadge).toHaveBeenCalled()
  })

  it('clears badge when badge_enabled is false but navigator has clearAppBadge', () => {
    vi.stubGlobal('navigator', {
      clearAppBadge: vi.fn().mockResolvedValue(true)
    })

    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: false } as any
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(navigator.clearAppBadge).toHaveBeenCalled()
  })

  it('renders create channel button and opens modal', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
    })
    
    render(<Lobby />, { wrapper: MemoryRouter })
    
    const createBtn = screen.getByRole('button', { name: 'Create Channel' })
    expect(createBtn).toBeInTheDocument()
    
    // Clicking should open the modal which has the heading 'Create a New Channel'
    fireEvent.click(createBtn)
    expect(screen.getByText('Create a New Channel')).toBeInTheDocument()
  })

  it('greys out and blocks create button at channel cap for non-admins', () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() })

    vi.mocked(useChannels).mockReturnValue({
      myChannels: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `Channel ${i}`,
        member: { character_name: 'Hero' }
      }) as any),
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const createBtn = screen.getByRole('button', { name: 'Create Channel' })
    expect(createBtn).toHaveAttribute('aria-disabled', 'true')

    // jsdom suppresses clicks on disabled buttons; the wrapper owns the onClick
    // so the toast still fires in the browser when a capped user clicks the FAB.
    fireEvent.click(screen.getByTestId('create-channel-fab'))
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Channel limit reached'), 'error')
    expect(screen.queryByText('Create a New Channel')).not.toBeInTheDocument()
  })

  it('does not cap server admins', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' },
      profile: { server_admin: true }
    } as any)

    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        name: `Channel ${i}`,
        member: { character_name: 'Hero' }
      }) as any),
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const createBtn = screen.getByRole('button', { name: 'Create Channel' })
    await waitFor(() => expect(createBtn).not.toBeDisabled())

    fireEvent.click(createBtn)
    expect(screen.getByText('Create a New Channel')).toBeInTheDocument()
  })

  it('shows GM badge for channels the user runs and Player badge otherwise', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' },
      profile: { server_admin: false }
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'My GM Channel', gm_id: 'u1', member: { character_name: 'Hero' } } as any,
        { id: '2', name: 'Someone Elses', gm_id: 'u2', member: { character_name: 'Sidekick' } } as any,
      ],
      loading: false,
      error: null,
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const gmBadges = screen.getAllByText('GM')
    expect(gmBadges).toHaveLength(1)
    const playerBadges = screen.getAllByText('Player')
    expect(playerBadges).toHaveLength(1)

    const gmLink = screen.getByText('My GM Channel').closest('a')
    expect(gmLink).toHaveTextContent('GM')
    expect(gmLink).not.toHaveTextContent('Player')
  })

  it('renders the channel avatar image when set', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'My Channel', avatar_url: 'https://img/av.jpg', member: { character_name: 'Hero' } } as any,
      ],
      loading: false,
      error: null,
    })

    const { getByTestId } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(getByTestId('channel-avatar').tagName).toBe('IMG')
    expect(getByTestId('channel-avatar')).toHaveAttribute('src', 'https://img/av.jpg')
  })

  it('falls back to the channel initial when no avatar is set', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'My Channel', member: { character_name: 'Hero' } } as any,
      ],
      loading: false,
      error: null,
    })

    const { getByTestId } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(getByTestId('channel-avatar').tagName).toBe('DIV')
    expect(getByTestId('channel-avatar')).toHaveTextContent('M')
  })
})
