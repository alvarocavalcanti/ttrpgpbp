import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateChannelModal } from './CreateChannelModal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/crypto', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password')
}))

describe('CreateChannelModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { display_name: 'GM' } as any,
      loading: false,
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn()
    })
    
    // Polyfill crypto.randomUUID
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '12345678-abcd' },
      configurable: true
    })
  })

  it('creates channel and joins successfully', async () => {
    const mockOnClose = vi.fn()
    
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: 'c1' }, 
      error: null 
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={mockOnClose} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.change(screen.getByLabelText('Password (Optional)'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Game',
        gm_id: 'u1',
        is_public: true,
        invite_code: '12345678'
      }))
      
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: 'c1',
        p_character_name: 'GM',
        p_password_hash: 'hashed_password'
      })
      
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('creates channel without password', async () => {
    const mockOnClose = vi.fn()
    
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: 'c1' }, 
      error: null 
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={mockOnClose} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Game',
        gm_id: 'u1',
        is_public: true,
        invite_code: '12345678'
      }))
      
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: 'c1',
        p_character_name: 'GM',
        p_password_hash: undefined
      })
      
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('handles creation error', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: null, 
      error: new Error('Insert failed') 
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create channel. Please try again.')).toBeInTheDocument()
    })
  })

  it('handles creation error when channel_secrets insert fails', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: 'c1' }, 
      error: null 
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsertChannel = vi.fn().mockReturnValue({ select: mockSelect })
    const mockInsertSecret = vi.fn().mockResolvedValue({ error: new Error('Secrets insert failed') })
    
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { insert: mockInsertChannel } as any
      if (table === 'channel_secrets') return { insert: mockInsertSecret } as any
      return {} as any
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.change(screen.getByLabelText('Password (Optional)'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create channel. Please try again.')).toBeInTheDocument()
    })
  })

  it('closes on cancel', () => {
    const mockOnClose = vi.fn()
    render(
      <MemoryRouter>
        <CreateChannelModal onClose={mockOnClose} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})
