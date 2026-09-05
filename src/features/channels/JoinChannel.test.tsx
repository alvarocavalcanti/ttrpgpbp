import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JoinChannel } from './JoinChannel'
import { useChannelJoin } from './useChannelJoin'
import { useAuth } from '../auth/useAuth'
import { hashPasswordWithSalt, hashPasswordLegacy } from '../../lib/crypto'

vi.mock('./useChannelJoin', () => ({
  useChannelJoin: vi.fn()
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/crypto', () => ({
  hashPasswordLegacy: vi.fn().mockResolvedValue('hashed_password'),
  hashPasswordWithSalt: vi.fn().mockResolvedValue('hashed_password')
}))

const previewChannel = { id: '123', name: 'Test Channel', game_system: 'none', has_password: false }

const mockJoinChannel = vi.fn()
const mockGetChannelSalt = vi.fn()

const mockHook = ({ channel = previewChannel, loading = false, error = null }:
  { channel?: typeof previewChannel | null, loading?: boolean, error?: Error | null } = {}) => {
  vi.mocked(useChannelJoin).mockReturnValue({
    channel,
    loading,
    error,
    getChannelSalt: mockGetChannelSalt,
    joinChannel: mockJoinChannel
  } as any)
}

function renderJoin(initialEntry = '/join/123') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/join/:id" element={<JoinChannel />} />
        <Route path="/channel/:id" element={<div data-testid="success-redirect" />} />
        <Route path="/" element={<div data-testid="lobby" />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('JoinChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJoinChannel.mockResolvedValue({ success: true })
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { display_name: 'TestUser' } as any,
      loading: false,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn()
    })
  })

  it('shows not found if channel does not exist', async () => {
    mockHook({ channel: null, error: new Error('not found') })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderJoin()

    await waitFor(() => {
      expect(screen.getByText('Channel Not Found')).toBeInTheDocument()
    })
  })

  it('renders form and joins successfully without password', async () => {
    mockHook()

    renderJoin()

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText('Character Name')
    expect(nameInput).toHaveValue('TestUser') // prefilled
    expect(nameInput).toHaveAttribute('maxlength', '20')

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(mockJoinChannel).toHaveBeenCalledWith({
        characterName: 'TestUser',
        passwordHash: undefined,
        inviteCode: undefined,
        characterAttributes: {}
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('handles password channel successfully', async () => {
    mockHook({ channel: { ...previewChannel, has_password: true } })
    mockGetChannelSalt.mockResolvedValue(null)

    renderJoin()

    await waitFor(() => {
      expect(screen.getByLabelText('Channel Password')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Channel Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(mockJoinChannel).toHaveBeenCalledWith({
        characterName: 'TestUser',
        passwordHash: 'hashed_password',
        inviteCode: undefined,
        characterAttributes: {}
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('re-derives the hash with the channel salt when joining a salted channel', async () => {
    vi.mocked(hashPasswordWithSalt).mockResolvedValue('derived_hash')
    mockHook({ channel: { ...previewChannel, has_password: true } })
    mockGetChannelSalt.mockResolvedValue('aabbccddeeff00112233445566778899')

    renderJoin()

    await waitFor(() => {
      expect(screen.getByLabelText('Channel Password')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Channel Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(mockGetChannelSalt).toHaveBeenCalledWith('123')
      expect(hashPasswordWithSalt).toHaveBeenCalledWith('secret', 'aabbccddeeff00112233445566778899')
      expect(mockJoinChannel).toHaveBeenCalledWith({
        characterName: 'TestUser',
        passwordHash: 'derived_hash',
        inviteCode: undefined,
        characterAttributes: {}
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('falls back to the legacy SHA-256 hash for salt-less channels', async () => {
    vi.mocked(hashPasswordLegacy).mockResolvedValue('legacy_hash')
    mockHook({ channel: { ...previewChannel, has_password: true } })
    mockGetChannelSalt.mockResolvedValue(null)

    renderJoin()

    await waitFor(() => {
      expect(screen.getByLabelText('Channel Password')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Channel Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(hashPasswordLegacy).toHaveBeenCalledWith('secret')
      expect(hashPasswordWithSalt).not.toHaveBeenCalled()
      expect(mockJoinChannel).toHaveBeenCalledWith({
        characterName: 'TestUser',
        passwordHash: 'legacy_hash',
        inviteCode: undefined,
        characterAttributes: {}
      })
    })
  })

  it('surfaces the RPC error message when joining fails', async () => {
    mockHook()
    mockJoinChannel.mockResolvedValue({ success: false, error: 'This channel has been archived and can no longer be joined.' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderJoin()

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(screen.getByText('This channel has been archived and can no longer be joined.')).toBeInTheDocument()
    })
  })

  it('cancels join flow', async () => {
    mockHook()

    renderJoin()

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.getByTestId('lobby')).toBeInTheDocument()
    })
  })

  it('shows join form with invite code even if the preview cannot be loaded', async () => {
    mockHook({ channel: null, error: new Error('Preview unavailable') })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderJoin('/join/123?code=abc123')

    await waitFor(() => {
      expect(screen.getByText('Join Channel')).toBeInTheDocument()
    })

    expect(screen.queryByText('Channel Not Found')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Channel Password')).not.toBeInTheDocument()
    expect(screen.getByText('You are joining with a valid invite link.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(mockJoinChannel).toHaveBeenCalledWith({
        characterName: 'TestUser',
        passwordHash: undefined,
        inviteCode: 'abc123',
        characterAttributes: {}
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })

  it('toggles password visibility', async () => {
    mockHook({ channel: { ...previewChannel, has_password: true } })

    renderJoin()

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

  it('flags out-of-range stat input in red and blocks joining', async () => {
    mockHook({ channel: { ...previewChannel, game_system: 'shadowdark' } })

    renderJoin()

    await waitFor(() => {
      expect(screen.getByLabelText('STR')).toBeInTheDocument()
    })

    const strInput = screen.getByLabelText('STR')
    const subTitle = screen.getByText('Shadowdark modifiers range from -4 to 4')
    // Fields start at 0 — no empty state to validate.
    expect(strInput).toHaveValue('0')

    // Non-integer keystrokes are ignored.
    fireEvent.change(strInput, { target: { value: '2.5' } })
    expect(strInput).toHaveValue('0')

    fireEvent.change(strInput, { target: { value: '6' } })
    expect(strInput).toHaveAttribute('aria-invalid', 'true')
    expect(strInput.className).toContain('border-red-500')
    expect(subTitle).toHaveClass('text-red-600')
    expect(screen.getByRole('button', { name: 'Join Campaign' })).toBeDisabled()

    fireEvent.change(strInput, { target: { value: '-2' } })
    expect(strInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(subTitle).not.toHaveClass('text-red-600')
    expect(screen.getByRole('button', { name: 'Join Campaign' })).toBeEnabled()
  })

  it('accepts only integer stat input and joins with sanitized modifiers', async () => {
    mockHook({ channel: { ...previewChannel, game_system: 'shadowdark' } })

    renderJoin()

    await waitFor(() => {
      expect(screen.getByLabelText('STR')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('STR'), { target: { value: '4' } })

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(mockJoinChannel).toHaveBeenCalledWith({
        characterName: 'TestUser',
        passwordHash: undefined,
        inviteCode: undefined,
        characterAttributes: { STR: 4, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 }
      })
      expect(screen.getByTestId('success-redirect')).toBeInTheDocument()
    })
  })
})
