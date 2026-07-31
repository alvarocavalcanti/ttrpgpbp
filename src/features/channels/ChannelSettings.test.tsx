import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />)
    
    expect(screen.getByDisplayValue('Game Room')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://map')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://localhost/join/c1?code=123')).toBeInTheDocument()
  })

  it('copies invite link to clipboard', () => {
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/join/c1?code=123')
  })

  it('saves changes without password update', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()
    const mockOnClose = vi.fn()

    render(<ChannelSettings channel={mockChannel} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'New Name',
        is_public: true,
        map_url: 'http://map',
        resources_url: 'http://resources'
      })
      expect(mockEq).toHaveBeenCalledWith('id', 'c1')
      expect(mockOnUpdate).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('saves changes with password update', async () => {
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
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={mockOnUpdate} />)

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
})
