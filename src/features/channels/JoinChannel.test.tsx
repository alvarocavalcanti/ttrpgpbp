import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JoinChannel } from './JoinChannel'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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

describe('JoinChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { display_name: 'TestUser' } as any,
      loading: false,
      session: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn()
    })
  })

  it('shows not found if channel does not exist', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/join/123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Channel Not Found')).toBeInTheDocument()
    })
  })

  it('renders form and joins successfully without password', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: '123', name: 'Test Channel', has_password: false }, 
      error: null 
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)

    render(
      <MemoryRouter initialEntries={['/join/123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
          <Route path="/channel/:id" element={<div data-testid="success-redirect" />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText('Character Name')
    expect(nameInput).toHaveValue('TestUser') // prefilled
    
    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: '123',
        p_character_name: 'TestUser',
        p_password_hash: undefined,
        p_invite_code: undefined
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('handles password channel successfully', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: '123', name: 'Test Channel', has_password: true }, 
      error: null 
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)

    render(
      <MemoryRouter initialEntries={['/join/123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
          <Route path="/channel/:id" element={<div data-testid="success-redirect" />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Channel Password')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Channel Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: '123',
        p_character_name: 'TestUser',
        p_password_hash: 'hashed_password',
        p_invite_code: undefined
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('handles join error', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: '123', name: 'Test Channel', has_password: false }, 
      error: null 
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: new Error('RPC Failed') } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/join/123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to join channel. Invalid password or invite code.')).toBeInTheDocument()
    })
  })

  it('cancels join flow', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: '123', name: 'Test Channel', has_password: false }, 
      error: null 
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <MemoryRouter initialEntries={['/join/123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
          <Route path="/" element={<div data-testid="lobby" />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.getByTestId('lobby')).toBeInTheDocument()
    })
  })

  it('toggles password visibility', async () => {
    const mockChannel = {
      id: '123',
      name: 'Test Channel',
      is_public: false,
      has_password: true
    }
    
    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    render(
      <MemoryRouter initialEntries={['/join/123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Channel Password')).toBeInTheDocument()
    })

    const passwordInput = screen.getByLabelText('Channel Password')
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggleBtn = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(toggleBtn)

    expect(passwordInput).toHaveAttribute('type', 'text')
    
    const hideBtn = screen.getByRole('button', { name: 'Hide password' })
    fireEvent.click(hideBtn)

    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
