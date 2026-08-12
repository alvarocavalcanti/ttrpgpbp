import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JoinChannel } from './JoinChannel'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { hashPasswordWithSalt, hashPasswordLegacy } from '../../lib/crypto'
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
  hashPasswordLegacy: vi.fn().mockResolvedValue('hashed_password'),
  hashPasswordWithSalt: vi.fn().mockResolvedValue('hashed_password')
}))

const preview = (overrides: Partial<{ name: string; has_password: boolean }> = {}) => ({
  data: [{
    id: '123',
    name: 'Test Channel',
    game_system: 'none',
    has_password: false,
    ...overrides
  }],
  error: null
})

describe('JoinChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { display_name: 'TestUser' } as any,
      loading: false,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn()
    })
  })

  it('shows not found if channel does not exist', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
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
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(preview() as any)
      .mockResolvedValueOnce({ error: null } as any)

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
    expect(nameInput).toHaveAttribute('maxlength', '20')
    
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
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(preview({ has_password: true }) as any)
      .mockResolvedValueOnce({ data: null, error: null } as any)
      .mockResolvedValueOnce({ error: null } as any)

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

  it('re-derives the hash with the channel salt when joining a salted channel', async () => {
    vi.mocked(hashPasswordWithSalt).mockResolvedValue('derived_hash')
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(preview({ has_password: true }) as any)
      .mockResolvedValueOnce({ data: 'aabbccddeeff00112233445566778899', error: null } as any)
      .mockResolvedValueOnce({ error: null } as any)

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
      expect(supabase.rpc).toHaveBeenCalledWith('get_channel_salt', { p_channel_id: '123' })
      expect(hashPasswordWithSalt).toHaveBeenCalledWith('secret', 'aabbccddeeff00112233445566778899')
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: '123',
        p_character_name: 'TestUser',
        p_password_hash: 'derived_hash',
        p_invite_code: undefined
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('falls back to the legacy SHA-256 hash for salt-less channels', async () => {
    vi.mocked(hashPasswordLegacy).mockResolvedValue('legacy_hash')
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(preview({ has_password: true }) as any)
      .mockResolvedValueOnce({ data: null, error: null } as any)
      .mockResolvedValueOnce({ error: null } as any)

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
      expect(hashPasswordLegacy).toHaveBeenCalledWith('secret')
      expect(hashPasswordWithSalt).not.toHaveBeenCalled()
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: '123',
        p_character_name: 'TestUser',
        p_password_hash: 'legacy_hash',
        p_invite_code: undefined
      })
    })
  })

  it('handles join error', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(preview() as any)
      .mockResolvedValueOnce({ error: new Error('RPC Failed') } as any)
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
    vi.mocked(supabase.rpc).mockResolvedValue(preview() as any)

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

  it('shows join form with invite code even if the preview cannot be loaded', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [], error: new Error('Preview unavailable') } as any)
      .mockResolvedValueOnce({ error: null } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/join/123?code=abc123']}>
        <Routes>
          <Route path="/join/:id" element={<JoinChannel />} />
          <Route path="/channel/:id" element={<div data-testid="success-redirect" />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    expect(screen.queryByText('Channel Not Found')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Channel Password')).not.toBeInTheDocument()
    expect(screen.getByText('You are joining with a valid invite link.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
        p_channel_id: '123',
        p_character_name: 'TestUser',
        p_password_hash: undefined,
        p_invite_code: 'abc123'
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('toggles password visibility', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue(preview({ has_password: true }) as any)

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
