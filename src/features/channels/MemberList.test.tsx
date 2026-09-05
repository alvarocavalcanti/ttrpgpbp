import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemberList } from './MemberList'
import { supabase } from '../../lib/supabase'
import { useMemberModeration } from './useMemberModeration'

// EditCharacterModal still owns its own data layer, so the supabase mock
// stays; MemberList's moderation/away calls now go through the hook mock.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('./useMemberModeration', () => ({
  useMemberModeration: vi.fn()
}))

const successInsert = () => vi.fn().mockResolvedValue({ error: null })

const mockModerateMember = vi.fn()
const mockSetAway = vi.fn()

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
    mockModerateMember.mockResolvedValue(null)
    mockSetAway.mockResolvedValue(null)
    vi.mocked(useMemberModeration).mockReturnValue({
      moderateMember: mockModerateMember,
      setAway: mockSetAway
    } as any)
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

  it('does not render a Sheet link for exotic-scheme URLs (defense in depth)', () => {
    const hostile = [{ ...mockMembers[0], id: 'm9', user_id: 'u9', character_sheet_url: 'javascript:alert(1)' }]
    render(<StatefulMemberList members={hostile} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.queryByText('Sheet')).not.toBeInTheDocument()
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

  it('closes the edit character modal via Cancel', () => {
    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Edit Character'))
    expect(screen.getByDisplayValue('Sidekick')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByDisplayValue('Sidekick')).not.toBeInTheDocument()
  })

  it('allows GM to block player', async () => {
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))

    // In-app confirmation opens instead of window.confirm
    expect(screen.getByRole('dialog', { name: 'Block this player?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Block' }))

    await waitFor(() => {
      expect(mockModerateMember).toHaveBeenCalledWith('c1', 'm2', 'block')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('does not block when the confirmation is cancelled', async () => {
    render(<StatefulMemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockModerateMember).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Block this player?' })).not.toBeInTheDocument()
  })

  it('allows GM to unblock a player', async () => {
    mockModerateMember.mockResolvedValue(null)
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }))

    await waitFor(() => {
      expect(mockModerateMember).toHaveBeenCalledWith('c1', 'm3', 'unblock')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('handles unblock member error', async () => {
    mockModerateMember.mockResolvedValue(new Error('DB Error'))
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
    mockModerateMember.mockResolvedValue(new Error('DB Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    fireEvent.click(screen.getByRole('button', { name: 'Block' }))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(screen.getByText('Failed to block member.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('allows GM to kick player', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    fireEvent.click(screen.getByRole('button', { name: 'Kick' }))

    await waitFor(() => {
      expect(mockModerateMember).toHaveBeenCalledWith('c1', 'm2', 'kick')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows player to leave channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))

    await waitFor(() => {
      expect(mockModerateMember).toHaveBeenCalledWith('c1', 'm2', 'leave')
    })
  })

  it('handles kick member error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    mockModerateMember.mockResolvedValue(new Error('err'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    fireEvent.click(screen.getByRole('button', { name: 'Kick' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to kick member.')).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })
  })

  it('handles leave channel error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    mockModerateMember.mockResolvedValue(new Error('err'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))

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
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(window.prompt).toHaveBeenCalled()
      expect(mockSetAway).toHaveBeenCalledWith('m2', true, 'Back on Thursday')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('rejects away messages over 200 characters', async () => {
    window.prompt = vi.fn().mockReturnValue('x'.repeat(201))
    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(screen.getByText('Away message is limited to 200 characters.')).toBeInTheDocument()
      expect(mockSetAway).not.toHaveBeenCalled()
    })
  })

  it('allows marking self as back (clears away)', async () => {
    window.prompt = vi.fn()
    const mockOnUpdate = vi.fn()

    const members: any[] = mockMembers.map(m => m.id === 'm2' ? { ...m, is_away: true, away_message: 'BRB' } : m)
    render(<StatefulMemberList members={members} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Back (Available)'))

    await waitFor(() => {
      expect(window.prompt).not.toHaveBeenCalled()
      expect(mockSetAway).toHaveBeenCalledWith('m2', false, null)
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('cancels away marking when prompt dismissed', async () => {
    window.prompt = vi.fn().mockReturnValue(null)

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(window.prompt).toHaveBeenCalled()
      expect(mockSetAway).not.toHaveBeenCalled()
    })
  })

  it('handles toggle away error', async () => {
    window.prompt = vi.fn().mockReturnValue('')
    mockSetAway.mockResolvedValue(new Error('DB Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<StatefulMemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" channelId="c1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Mark Away (AFK)'))

    await waitFor(() => {
      expect(mockSetAway).toHaveBeenCalledWith('m2', true, null)
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
