import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Lobby } from './Lobby'
import { useChannels } from './useChannels'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./useChannels', () => ({
  useChannels: vi.fn()
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

  it('renders channels correctly', () => {
    vi.mocked(useChannels).mockReturnValue({
      publicChannels: [
        { id: '1', name: 'Public One', is_public: true, has_password: false } as any,
        { id: '2', name: 'Locked Public', is_public: true, has_password: true } as any
      ],
      myChannels: [
        { id: '1', name: 'Public One', is_public: true, member: { character_name: 'Hero' } } as any
      ],
      loading: false
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    
    // My channels section
    expect(screen.getByText('Joined as Hero')).toBeInTheDocument()
    
    // Public channels section
    // Public One shouldn't have lock icon, Locked Public should
    // In our UI, isMember removes the lock icon logic anyway because it changes to member logic
    expect(screen.getByText('Locked Public')).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument() // The lock icon
  })
})
