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
  hashPassword: vi.fn().mockResolvedValue({ hash: 'hashed_password', salt: 'salt_value' })
}))

vi.mock('../../hooks/useAppSetting', () => ({
  useAppSetting: vi.fn().mockReturnValue({ value: 10, loading: false, error: null, refresh: vi.fn() })
}))

describe('CreateChannelModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { display_name: 'GM' } as any,
      loading: false,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn()
    })
    
    // Polyfill crypto.randomUUID
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '12345678-abcd' },
      configurable: true
    })

    // Admin gating reads the is_server_admin RPC; non-admin by default so the
    // channel-cap pre-check runs. create_channel mocks override per test.
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)
  })

  it('creates channel atomically via create_channel RPC with password', async () => {
    const mockOnClose = vi.fn()

    const mockCountEq = vi.fn().mockResolvedValue({ count: 0 })
    const mockCountSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockCountEq }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockCountSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'c1', error: null } as any)

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={mockOnClose} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.change(screen.getByLabelText('Password (Optional)'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('create_channel', {
        p_name: 'New Game',
        p_game_system: 'none',
        p_invite_code: '12345678',
        p_character_name: 'GM',
        p_password_hash: 'hashed_password',
        p_password_salt: 'salt_value'
      })

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('creates channel without password', async () => {
    const mockOnClose = vi.fn()

    const mockCountEq = vi.fn().mockResolvedValue({ count: 0 })
    const mockCountSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockCountEq }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockCountSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'c1', error: null } as any)

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={mockOnClose} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('create_channel', {
        p_name: 'New Game',
        p_game_system: 'none',
        p_invite_code: '12345678',
        p_character_name: 'GM',
        p_password_hash: null,
        p_password_salt: null
      })

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('handles creation error from the RPC', async () => {
    const mockOnClose = vi.fn()

    const mockCountEq = vi.fn().mockResolvedValue({ count: 0 })
    const mockCountSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockCountEq }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockCountSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('RPC failed') } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={mockOnClose} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create channel. Please try again.')).toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  it('handles creation error when the RPC returns no channel id', async () => {
    const mockCountEq = vi.fn().mockResolvedValue({ count: 0 })
    const mockCountSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockCountEq }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockCountSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
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

  it('blocks creation at channel cap without calling the RPC', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channel_members') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 10 }) }) }) } as any
      }
      return {} as any
    })

    render(
      <MemoryRouter>
        <CreateChannelModal onClose={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText(/Channel limit reached/)).toBeInTheDocument()
      // Admin-gating RPC may fire, but the create must not.
      expect(supabase.rpc).not.toHaveBeenCalledWith('create_channel', expect.anything())
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

  it('toggles password visibility', () => {
    render(
      <MemoryRouter>
        <CreateChannelModal onClose={vi.fn()} />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText('Password (Optional)')
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggleBtn = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(toggleBtn)

    expect(passwordInput).toHaveAttribute('type', 'text')
    
    const hideBtn = screen.getByRole('button', { name: 'Hide password' })
    fireEvent.click(hideBtn)

    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
