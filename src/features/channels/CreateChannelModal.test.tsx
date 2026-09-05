import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateChannelModal } from './CreateChannelModal'
import { useCreateChannel } from './useCreateChannel'
import { useAuth } from '../auth/useAuth'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'

vi.mock('./useCreateChannel', () => ({
  useCreateChannel: vi.fn()
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

vi.mock('../../lib/crypto', () => ({
  hashPassword: vi.fn().mockResolvedValue({ hash: 'hashed_password', salt: 'salt_value' })
}))

vi.mock('../../hooks/useAppSetting', () => ({
  useAppSetting: vi.fn().mockReturnValue({ value: 10, loading: false, error: null, refresh: vi.fn() })
}))

describe('CreateChannelModal', () => {
  const mockOnClose = vi.fn()
  const mockCountMyChannels = vi.fn()
  const mockCreateChannel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { display_name: 'GM' } as any,
      loading: false,
      session: null,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn()
    } as any)
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false } as any)
    mockCountMyChannels.mockResolvedValue(0)
    mockCreateChannel.mockResolvedValue('c1')
    vi.mocked(useCreateChannel).mockReturnValue({ countMyChannels: mockCountMyChannels, createChannel: mockCreateChannel })

    // Polyfill crypto.randomUUID
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '12345678-abcd' },
      configurable: true
    })
  })

  function renderModal(onClose = mockOnClose) {
    return render(
      <MemoryRouter>
        <CreateChannelModal onClose={onClose} />
      </MemoryRouter>
    )
  }

  it('caps channel names at 80 characters', () => {
    renderModal()
    expect(screen.getByLabelText('Channel Name')).toHaveAttribute('maxLength', '80')
  })

  it('creates channel atomically via the hook with password', async () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.change(screen.getByLabelText('Password (Optional)'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockCreateChannel).toHaveBeenCalledWith({
        name: 'New Game',
        gameSystem: 'none',
        inviteCode: '12345678',
        characterName: 'GM',
        passwordHash: 'hashed_password',
        passwordSalt: 'salt_value'
      })

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('creates channel without password', async () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockCreateChannel).toHaveBeenCalledWith({
        name: 'New Game',
        gameSystem: 'none',
        inviteCode: '12345678',
        characterName: 'GM',
        passwordHash: undefined,
        passwordSalt: undefined
      })

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('handles creation error from the RPC', async () => {
    mockCreateChannel.mockRejectedValue(new Error('RPC failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderModal()

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create channel. Please try again.')).toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  it('handles creation error when the RPC returns no channel id', async () => {
    mockCreateChannel.mockRejectedValue(new Error('Failed to create channel'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderModal()

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create channel. Please try again.')).toBeInTheDocument()
    })
  })

  it('blocks creation at channel cap without calling the RPC', async () => {
    mockCountMyChannels.mockResolvedValue(10)

    renderModal()

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText(/Channel limit reached/)).toBeInTheDocument()
      expect(mockCreateChannel).not.toHaveBeenCalled()
    })
  })

  it('skips the channel-cap pre-check for server admins', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false } as any)

    renderModal()

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Game' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockCountMyChannels).not.toHaveBeenCalled()
      expect(mockCreateChannel).toHaveBeenCalled()
    })
  })

  it('closes on cancel', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('toggles password visibility', () => {
    renderModal()

    const passwordInput = screen.getByLabelText('Password (Optional)')
    expect(passwordInput).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
