import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemberList } from './MemberList'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('MemberList', () => {
  const mockMembers: any[] = [
    {
      id: 'm1',
      user_id: 'u1',
      character_name: 'Hero',
      character_sheet_url: 'http://sheet',
      is_blocked: false,
      profile: { display_name: 'Player One' }
    },
    {
      id: 'm2',
      user_id: 'u2',
      character_name: 'Sidekick',
      is_blocked: false,
      profile: { display_name: 'Player Two' }
    },
    {
      id: 'm3',
      user_id: 'u3',
      character_name: 'Villain',
      is_blocked: true,
      profile: { display_name: 'Player Three' }
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Avoid reloading page during tests
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn() }
    })
    window.confirm = vi.fn().mockReturnValue(true)
  })

  it('renders active and blocked members correctly', () => {
    render(<MemberList members={mockMembers} isGM={true} channelId="c1" myUserId="u1" />)
    
    expect(screen.getByText('Players — 2')).toBeInTheDocument()
    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.getByText('Player One')).toBeInTheDocument()
    expect(screen.getByText('Sheet')).toBeInTheDocument()

    expect(screen.getByText('Blocked — 1')).toBeInTheDocument()
    expect(screen.getByText('Villain')).toBeInTheDocument()
  })

  it('allows editing own character', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<MemberList members={mockMembers} isGM={false} channelId="c1" myUserId="u1" />)
    
    fireEvent.click(screen.getByText('Edit Character'))
    
    const nameInput = screen.getByDisplayValue('Hero')
    fireEvent.change(nameInput, { target: { value: 'Super Hero' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        character_name: 'Super Hero',
        character_sheet_url: 'http://sheet'
      })
      expect(mockEq).toHaveBeenCalledWith('id', 'm1')
      expect(window.location.reload).toHaveBeenCalled()
    })
  })

  it('allows GM to block player', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<MemberList members={mockMembers} isGM={true} channelId="c1" myUserId="u1" />)
    
    fireEvent.click(screen.getByText('Block Player'))
    
    expect(window.confirm).toHaveBeenCalled()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_blocked: true })
      expect(mockEq).toHaveBeenCalledWith('id', 'm2')
      expect(window.location.reload).toHaveBeenCalled()
    })
  })

  it('handles update member error', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<MemberList members={mockMembers} isGM={false} channelId="c1" myUserId="u1" />)
    
    fireEvent.click(screen.getByText('Edit Character'))
    
    const nameInput = screen.getByDisplayValue('Hero')
    fireEvent.change(nameInput, { target: { value: 'Super Hero' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('handles block member error', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<MemberList members={mockMembers} isGM={true} channelId="c1" myUserId="u1" />)
    
    fireEvent.click(screen.getByText('Block Player'))
    
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })
})
