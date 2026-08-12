import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemberList } from './MemberList'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

const successInsert = () => vi.fn().mockResolvedValue({ error: null })

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

  it('renders active and blocked members correctly with GM badge', () => {
    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    expect(screen.getByText('Players — 2')).toBeInTheDocument()
    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.getByText('Player One')).toBeInTheDocument()
    expect(screen.getByText('GM')).toBeInTheDocument() // Check GM badge
    expect(screen.getByText('Sheet')).toBeInTheDocument()

    expect(screen.getByText('Blocked — 1')).toBeInTheDocument()
    expect(screen.getByText('Villain')).toBeInTheDocument()
  })

  it('allows editing own character', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, insert: successInsert() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Edit Character'))
    
    const nameInput = screen.getByDisplayValue('Sidekick')
    fireEvent.change(nameInput, { target: { value: 'Super Sidekick' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        character_name: 'Super Sidekick',
        character_sheet_url: null
      }))
      expect(mockEq).toHaveBeenCalledWith('id', 'm2')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows GM to block player and posts a system message', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockInsert = successInsert()
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, insert: mockInsert } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    
    expect(window.confirm).toHaveBeenCalled()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_blocked: true })
      expect(mockEq).toHaveBeenCalledWith('id', 'm2')
      expect(mockInsert).toHaveBeenCalledWith({
        channel_id: 'c1',
        sender_id: 'u1',
        type: 'system',
        content: 'Sidekick was blocked by the GM'
      })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows GM to unblock a player and posts a system message', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockInsert = successInsert()
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, insert: mockInsert } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_blocked: false })
      expect(mockEq).toHaveBeenCalledWith('id', 'm3')
      expect(mockInsert).toHaveBeenCalledWith({
        channel_id: 'c1',
        sender_id: 'u1',
        type: 'system',
        content: 'Villain was unblocked by the GM'
      })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('handles unblock member error', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, insert: successInsert() } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(screen.getByText('Failed to unblock member.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('handles update member error', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, insert: successInsert() } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m1'))
    fireEvent.click(screen.getByText('Edit Character'))
    
    const nameInput = screen.getByDisplayValue('Hero')
    fireEvent.change(nameInput, { target: { value: 'Super Hero' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('handles block member error', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, insert: successInsert() } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(screen.getByText('Failed to block member.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('allows GM to kick player and posts a system message', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockInsert = successInsert()
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn(), insert: mockInsert } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalledWith({
        channel_id: 'c1',
        sender_id: 'u1',
        type: 'system',
        content: 'Sidekick was kicked from the channel'
      })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows player to leave channel and posts a system message', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockInsert = successInsert()
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn(), insert: mockInsert } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalledWith({
        channel_id: 'c1',
        sender_id: 'u2',
        type: 'system',
        content: 'Sidekick left the channel'
      })
    })
  })


  it('surfaces system message insert failure on kick', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockInsert = vi.fn().mockResolvedValue({ error: new Error('RLS block') })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn(), insert: mockInsert } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(mockOnUpdate).toHaveBeenCalled()
      expect(screen.getByText('Player kicked, but failed to post the system message.')).toBeInTheDocument()
    })
  })

  it('handles kick member error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('err') }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn(), insert: successInsert() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(screen.getByText('Failed to kick member.')).toBeInTheDocument()
    })
  })

  it('handles leave channel error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('err') }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn(), insert: successInsert() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(screen.getByText('Failed to leave channel.')).toBeInTheDocument()
    })
  })

  it('hides kick and block options for GM', () => {
    // Setup where we are isGM but the GM ID is set to another user (edge case/co-GM)
    render(<MemberList members={mockMembers} isGM={true} gmId="u2" myUserId="u1" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    // Open menu for m2 (who is the GM here)
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    
    // The options should not exist in the DOM
    expect(screen.queryByText('Block Player')).not.toBeInTheDocument()
    expect(screen.queryByText('Kick Player')).not.toBeInTheDocument()
  })

  it('shows AFK badge and away message for away members', () => {
    const members: any[] = [
      { id: 'm1', user_id: 'u1', character_name: 'Hero', is_blocked: false, is_away: true, away_message: 'Away until Monday', profile: { display_name: 'Player One' } },
      { id: 'm2', user_id: 'u2', character_name: 'Sidekick', is_blocked: false, is_away: false, away_message: null, profile: { display_name: 'Player Two' } }
    ]
    render(<MemberList members={members} isGM={true} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    expect(screen.getByText('AFK')).toBeInTheDocument()
    expect(screen.getByText('Away until Monday')).toBeInTheDocument()
    expect(screen.getAllByText('AFK')).toHaveLength(1)
  })

  it('allows marking self as away with an away message', async () => {
    window.prompt = vi.fn().mockReturnValue('Back on Thursday')
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(window.prompt).toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith({ is_away: true, away_message: 'Back on Thursday' })
      expect(mockEq).toHaveBeenCalledWith('id', 'm2')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows marking self as back (clears away)', async () => {
    window.prompt = vi.fn()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    const members: any[] = mockMembers.map(m => m.id === 'm2' ? { ...m, is_away: true, away_message: 'BRB' } : m)
    render(<MemberList members={members} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Back (Available)'))

    await waitFor(() => {
      expect(window.prompt).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith({ is_away: false, away_message: null })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('cancels away marking when prompt dismissed', async () => {
    window.prompt = vi.fn().mockReturnValue(null)
    const mockUpdate = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(window.prompt).toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  it('handles toggle away error', async () => {
    window.prompt = vi.fn().mockReturnValue('')
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_away: true, away_message: null })
      expect(screen.getByText('Failed to update away status.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })
})
