import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Lobby } from './Lobby'
import { useChannels } from './useChannels'
import { MemoryRouter } from 'react-router-dom'
import { usePushNotifications } from '../auth/usePushNotifications'

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

describe('Lobby', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: true } as any
    } as any)
  })

  it('renders loading state', () => {
    vi.mocked(useChannels).mockReturnValue({
      publicChannels: [],
      myChannels: [],
      loading: true
    })

    const { container } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders empty states when no channels exist', () => {
    vi.mocked(useChannels).mockReturnValue({
      publicChannels: [],
      myChannels: [],
      loading: false
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByText("You haven't joined any channels yet.")).toBeInTheDocument()
    expect(screen.getByText("No public channels available.")).toBeInTheDocument()
  })

  it('renders channels correctly with unread counts', () => {
    vi.mocked(useChannels).mockReturnValue({
      publicChannels: [
        { id: '1', name: 'Public One', is_public: true, has_password: false } as any,
        { id: '2', name: 'Locked Public', is_public: true, has_password: true } as any
      ],
      myChannels: [
        { 
          id: '1', 
          name: 'Public One', 
          is_public: true, 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any
      ],
      loading: false
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    
    // My channels section
    expect(screen.getByText('Joined as Hero')).toBeInTheDocument()
    expect(screen.getByText('5 new')).toBeInTheDocument()
    
    // Public channels section
    expect(screen.getByText('Locked Public')).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument() // The lock icon
  })
  it('hides unread counts if badge_enabled is false', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: false } as any
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      publicChannels: [],
      myChannels: [
        { 
          id: '1', 
          name: 'Public One', 
          is_public: true, 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any
      ],
      loading: false
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
      publicChannels: [],
      myChannels: [
        { 
          id: '1', 
          name: 'Public One', 
          is_public: true, 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any,
        { 
          id: '2', 
          name: 'Public Two', 
          is_public: true, 
          member: { character_name: 'Hero2' },
          unread_count: 2
        } as any
      ],
      loading: false
    })

    const { unmount } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(navigator.setAppBadge).toHaveBeenCalledWith(7)

    // Clear badge when no unread count
    vi.mocked(useChannels).mockReturnValue({
      publicChannels: [],
      myChannels: [
        { 
          id: '1', 
          name: 'Public One', 
          is_public: true, 
          member: { character_name: 'Hero' },
          unread_count: 0 
        } as any
      ],
      loading: false
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
      publicChannels: [],
      myChannels: [],
      loading: false
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(navigator.clearAppBadge).toHaveBeenCalled()
  })

})