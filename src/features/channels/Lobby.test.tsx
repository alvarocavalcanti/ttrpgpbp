import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Lobby } from './Lobby'
import { useChannels } from './useChannels'
import { MemoryRouter } from 'react-router-dom'
import { usePushNotifications } from '../auth/usePushNotifications'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../contexts/ToastContext'

vi.mock('./useChannels', () => ({
  useChannels: vi.fn()
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

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, profile: null })
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() })
}))

describe('Lobby', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: true } as any
    } as any)
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
    expect(screen.getByText('Joined as Hero')).toBeInTheDocument()
    expect(screen.getByText('5 new')).toBeInTheDocument()
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

    fireEvent.click(createBtn)
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Channel limit reached'), 'error')
    expect(screen.queryByText('Create a New Channel')).not.toBeInTheDocument()
  })

  it('does not cap server admins', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' },
      profile: { server_admin: true }
    } as any)

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
    expect(createBtn).not.toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(createBtn)
    expect(screen.getByText('Create a New Channel')).toBeInTheDocument()
  })
})
