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
    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
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
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

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
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Block Player'))
    
    expect(window.confirm).toHaveBeenCalled()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_blocked: true })
      expect(mockEq).toHaveBeenCalledWith('id', 'm2')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('handles update member error', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false}  gmId="u1" myUserId="u1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

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
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true}  gmId="u1" myUserId="u1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
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
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows player to leave channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
    })
  })


  it('handles kick member error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('err') }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
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
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(screen.getByText('Failed to leave channel.')).toBeInTheDocument()
    })
  })

  it('shows error when trying to block GM', () => {
    // Setup where we are isGM but the GM ID is set to another user (edge case/co-GM)
    render(<MemberList members={mockMembers} isGM={true} gmId="u2" myUserId="u1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByTestId('menu-btn-m2')) // m2 has user_id u2
    fireEvent.click(screen.getByText('Block Player'))
    expect(screen.getByText('Cannot block the GM.')).toBeInTheDocument()
  })

  it('shows error when trying to kick GM', () => {
    render(<MemberList members={mockMembers} isGM={true} gmId="u2" myUserId="u1" onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    expect(screen.getByText('Cannot kick the GM.')).toBeInTheDocument()
  })
})
