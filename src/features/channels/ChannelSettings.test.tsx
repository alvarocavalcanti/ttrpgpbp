import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelSettings } from './ChannelSettings'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

vi.mock('../../lib/crypto', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password')
}))

describe('ChannelSettings', () => {
  const mockChannel: any = {
    id: 'c1',
    name: 'Game Room',
    is_public: true,
    map_url: 'http://map',
    resources_url: 'http://resources',
    has_password: false,
    invite_code: '123'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { 
        reload: vi.fn(),
        origin: 'http://localhost' 
      }
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn() }
    })
  })

  it('renders correctly', () => {
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    expect(screen.getByDisplayValue('Game Room')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://map')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://localhost/join/c1?code=123')).toBeInTheDocument()
  })

  it('copies invite link to clipboard', () => {
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/join/c1?code=123')
  })

  it('saves changes without password update', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()
    const mockOnClose = vi.fn()

    render(<ChannelSettings channel={mockChannel} onClose={mockOnClose} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'New Name',
        is_public: true,
        game_system: 'none',
        map_url: 'http://map',
        resources_url: 'http://resources'
      })
      expect(mockEq).toHaveBeenCalledWith('id', 'c1')
      expect(mockOnUpdate).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('saves changes with password update when secret row exists', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    
    const mockSecretSelect = vi.fn().mockResolvedValue({ data: [{ channel_id: 'c1' }], error: null })
    const mockSecretEq = vi.fn().mockReturnValue({ select: mockSecretSelect })
    const mockSecretUpdate = vi.fn().mockReturnValue({ eq: mockSecretEq })
    
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      if (table === 'channel_secrets') return { update: mockSecretUpdate } as any
      return {} as any
    })

    const mockOnUpdate = vi.fn()
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Change Password'))
    
    const pwInput = screen.getByPlaceholderText('Leave blank to remove password')
    fireEvent.change(pwInput, { target: { value: 'new_secret' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockSecretUpdate).toHaveBeenCalledWith(expect.objectContaining({
        password_hash: 'hashed_password'
      }))
    })
  })

  it('saves changes with password update when secret row does not exist', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    
    const mockSecretSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockSecretEq = vi.fn().mockReturnValue({ select: mockSecretSelect })
    const mockSecretUpdate = vi.fn().mockReturnValue({ eq: mockSecretEq })
    const mockSecretInsert = vi.fn().mockResolvedValue({ error: null })
    
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      if (table === 'channel_secrets') return { update: mockSecretUpdate, insert: mockSecretInsert } as any
      return {} as any
    })

    const mockOnUpdate = vi.fn()
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Change Password'))
    
    const pwInput = screen.getByPlaceholderText('Leave blank to remove password')
    fireEvent.change(pwInput, { target: { value: 'new_secret' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockSecretInsert).toHaveBeenCalledWith(expect.objectContaining({
        password_hash: 'hashed_password'
      }))
    })
  })

  it('handles error when secret update fails', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    
    const mockSecretSelect = vi.fn().mockResolvedValue({ data: null, error: new Error('Update failed') })
    const mockSecretEq = vi.fn().mockReturnValue({ select: mockSecretSelect })
    const mockSecretUpdate = vi.fn().mockReturnValue({ eq: mockSecretEq })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      if (table === 'channel_secrets') return { update: mockSecretUpdate } as any
      return {} as any
    })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Change Password'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to update channel settings.')).toBeInTheDocument()
    })
  })

  it('toggles password visibility', () => {
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Change Password'))

    // In ChannelSettings, it doesn't have an explicit label text but it is rendered as an input when changing password
    const passwordInput = screen.getByPlaceholderText('Leave blank to remove password')
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggleBtn = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(toggleBtn)

    expect(passwordInput).toHaveAttribute('type', 'text')
    
    const hideBtn = screen.getByRole('button', { name: 'Hide password' })
    fireEvent.click(hideBtn)

    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('handles archive channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Archive Channel'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_archived: true })
    })
  })

  it('handles export chat', async () => {
    // Basic coverage for the button click
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ content: 'msg', created_at: '2023-01-01', sender: { display_name: 'test' } }], error: null }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalled()
    })
  })


  it('handles archive channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByText('Archive Channel'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_archived: true })
    })
  })

  it('handles export chat', async () => {
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ content: 'msg', created_at: '2023-01-01', sender: { display_name: 'test' } }], error: null }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalled()
    })
  })

})