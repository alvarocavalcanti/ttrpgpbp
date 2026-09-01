import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemberList } from './MemberList'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

const successInsert = () => vi.fn().mockResolvedValue({ error: null })

// Editing state lives in ChannelView now; tests mirror that with a stateful
// wrapper so "Edit Character" still opens the modal.
function StatefulMemberList(props: any) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  return <MemberList {...props} editingMemberId={editingMemberId} onEditMember={setEditingMemberId} />
}

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
    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
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

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

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

  it('allows GM to block player', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    
    expect(window.confirm).toHaveBeenCalled()

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('moderate_member', {
        p_channel_id: 'c1',
        p_member_id: 'm2',
        p_action: 'block'
      })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows GM to unblock a player', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('moderate_member', {
        p_channel_id: 'c1',
        p_member_id: 'm3',
        p_action: 'unblock'
      })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('handles unblock member error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
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

    render(<StatefulMemberList members={mockMembers} isGM={false}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

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
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(screen.getByText('Failed to block member.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('allows GM to kick player', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('moderate_member', {
        p_channel_id: 'c1',
        p_member_id: 'm2',
        p_action: 'kick'
      })
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows player to leave channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('moderate_member', {
        p_channel_id: 'c1',
        p_member_id: 'm2',
        p_action: 'leave'
      })
    })
  })

  it('handles kick member error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('err') })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(screen.getByText('Failed to kick member.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('handles leave channel error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('err') })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(screen.getByText('Failed to leave channel.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('hides kick and block options for GM', () => {
    // Setup where we are isGM but the GM ID is set to another user (edge case/co-GM)
    render(<StatefulMemberList members={mockMembers} isGM={true} gmId="u2" myUserId="u1" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
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
    render(<StatefulMemberList members={members} isGM={true} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

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

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(window.prompt).toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith({ is_away: true, away_message: 'Back on Thursday' })
      expect(mockEq).toHaveBeenCalledWith('id', 'm2')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('rejects away messages over 200 characters', async () => {
    window.prompt = vi.fn().mockReturnValue('x'.repeat(201))
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn() })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(screen.getByText('Away message is limited to 200 characters.')).toBeInTheDocument()
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  it('allows marking self as back (clears away)', async () => {
    window.prompt = vi.fn()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    const members: any[] = mockMembers.map(m => m.id === 'm2' ? { ...m, is_away: true, away_message: 'BRB' } : m)
    render(<StatefulMemberList members={members} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

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

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

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

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_away: true, away_message: null })
      expect(screen.getByText('Failed to update away status.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('renders character notes as plain text', () => {
    const members: any[] = [
      { id: 'm1', user_id: 'u1', character_name: 'Hero', character_notes: 'Wary of goblins.', is_blocked: false, profile: { display_name: 'Player One' } },
      { id: 'm2', user_id: 'u2', character_name: 'Sidekick', is_blocked: false, profile: { display_name: 'Player Two' } }
    ]
    render(<StatefulMemberList members={members} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    expect(screen.getByText('Wary of goblins.')).toBeInTheDocument()
  })
})
