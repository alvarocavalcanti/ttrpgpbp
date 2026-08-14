import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChannelSettings } from './ChannelSettings'
import { supabase } from '../../lib/supabase'
import { useChannelAvatar } from './useChannelAvatar'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

vi.mock('./useChannelAvatar', () => ({
  useChannelAvatar: vi.fn()
}))

vi.mock('../../lib/crypto', () => ({
  hashPassword: vi.fn().mockResolvedValue({ hash: 'hashed_password', salt: 'salt_value' })
}))

const mockAddToast = vi.fn()

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({
    addToast: mockAddToast
  }))
}))

describe('ChannelSettings', () => {
  const mockChannel: any = {
    id: 'c1',
    name: 'Game Room',
    map_url: 'http://map',
    resources_url: 'http://resources',
    has_password: false,
    invite_code: '123'
  }

  const mockSecretRow = (data: any[] = [{ channel_id: 'c1' }]) => {
    const mockSecretSelect = vi.fn().mockResolvedValue({ data, error: null })
    const mockSecretEq = vi.fn().mockReturnValue({ select: mockSecretSelect })
    const mockSecretUpdate = vi.fn().mockReturnValue({ eq: mockSecretEq })
    return { select: mockSecretSelect, eq: mockSecretEq, update: mockSecretUpdate }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddToast.mockClear()
    vi.mocked(useChannelAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: vi.fn().mockResolvedValue('https://img/new.jpg')
    } as any)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { 
        reload: vi.fn(),
        origin: 'http://localhost' 
      }
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true
    })
    document.execCommand = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders correctly', () => {
    render(<ChannelSettings channel={mockChannel} gmOnlyResourcesUrl="http://gmresources" onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    expect(screen.getByDisplayValue('Game Room')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://map')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://gmresources')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://localhost/join/c1?code=123')).toBeInTheDocument()
  })

  it('copies invite link to clipboard', async () => {
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/join/c1?code=123')
      expect(mockAddToast).toHaveBeenCalledWith('Invite link copied!', 'success')
    })
  })

  it('saves changes without password update', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const { update: mockSecretUpdate } = mockSecretRow()
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      if (table === 'channel_secrets') return { update: mockSecretUpdate } as any
      return {} as any
    })
    const mockOnUpdate = vi.fn()
    const mockOnClose = vi.fn()

    render(<ChannelSettings channel={mockChannel} gmOnlyResourcesUrl="http://gmresources" onClose={mockOnClose} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'New Name',
        game_system: 'none',
        map_url: 'http://map',
        resources_url: 'http://resources',
        safety_tools_url: null
      })
      expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ gm_only_resources_url: expect.anything() }))
      expect(mockSecretUpdate).toHaveBeenCalledWith({ gm_only_resources_url: 'http://gmresources' })
      expect(mockEq).toHaveBeenCalledWith('id', 'c1')
      expect(mockAddToast).toHaveBeenCalledWith('Channel settings saved successfully', 'success')
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
        password_hash: 'hashed_password',
        password_salt: 'salt_value'
      }))
    })
  })

  it('saves safety tools lines, veils, and URL', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockSafetyUpsert = vi.fn().mockResolvedValue({ error: null })
    const mockSafetySelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })
    })
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      if (table === 'channel_safety_tools') return { select: mockSafetySelect, upsert: mockSafetyUpsert } as any
      if (table === 'channel_secrets') return { update: mockSecretRow().update } as any
      return {} as any
    })
    const mockOnUpdate = vi.fn()

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Safety Tools (Lines & Veils)'))
    fireEvent.change(screen.getByLabelText('Lines'), { target: { value: 'no gore' } })
    fireEvent.change(screen.getByLabelText('Veils'), { target: { value: 'romance' } })
    fireEvent.change(screen.getByLabelText('Safety Tools URL'), { target: { value: 'https://docs.google.com/doc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        safety_tools_url: 'https://docs.google.com/doc'
      }))
      expect(mockSafetyUpsert).toHaveBeenCalledWith(expect.objectContaining({
        channel_id: 'c1',
        lines: 'no gore',
        veils: 'romance'
      }))
    })
  })

  it('does not save safety tools unless the section was opened', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockSafetyUpsert = vi.fn()
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      if (table === 'channel_safety_tools') return { upsert: mockSafetyUpsert } as any
      if (table === 'channel_secrets') return { update: mockSecretRow().update } as any
      return {} as any
    })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
      expect(mockSafetyUpsert).not.toHaveBeenCalled()
    })
  })

  it('saves changes with password update when secret row does not exist', async () => {    const mockEq = vi.fn().mockResolvedValue({ error: null })
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
        password_hash: 'hashed_password',
        password_salt: 'salt_value'
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
      expect(mockAddToast).toHaveBeenCalledWith('Failed to update channel settings.', 'error')
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

  it('handles archive channel error', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('DB Error') }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Archive Channel'))
    
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Failed to archive channel.', 'error')
    })
  })

  it('handles export chat error', async () => {
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: null, error: new Error('err') }) }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Failed to export channel.', 'error')
    })
  })

  it('handles export chat with 5000 messages warning', async () => {
    const messages = Array.from({ length: 5000 }).map((_, i) => ({ content: `msg ${i}`, created_at: '2023-01-01', sender: { display_name: 'test' }, type: 'regular' }))
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: messages, error: null }) }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(screen.getByText(/This channel has more than 5000 messages/)).toBeInTheDocument()
    })
  })

  it('handles export chat', async () => {
    // Basic coverage for the button click
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ content: 'msg', created_at: '2023-01-01', sender: { display_name: 'test' } }], error: null }) }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalled()
      expect(mockAddToast).toHaveBeenCalledWith('Chat exported successfully', 'success')
    })
  })

  it('handles copy fallback when not in secure context (success)', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false })
    document.execCommand = vi.fn().mockReturnValue(true)
    
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    
    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(mockAddToast).toHaveBeenCalledWith('Invite link copied!', 'success')
    })
  })

  it('handles copy fallback when not in secure context (failure)', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false })
    document.execCommand = vi.fn().mockReturnValue(false) // returns false on failure
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    
    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(mockAddToast).toHaveBeenCalledWith('Failed to copy invite link', 'error')
    })
  })

  it('renders the avatar upload input when uploads are enabled', () => {
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    const input = screen.getByLabelText('Channel Avatar')
    expect(input).toBeInTheDocument()
    expect(input).not.toBeDisabled()
    expect(screen.queryByText(/Image uploads are disabled/)).not.toBeInTheDocument()
  })

  it('shows the current avatar image when the channel has one', () => {
    render(
      <ChannelSettings channel={{ ...mockChannel, avatar_url: 'https://img/current.jpg' }} onClose={vi.fn()} onUpdate={vi.fn()} />,
      { wrapper: MemoryRouter }
    )

    expect(screen.getByAltText('Channel avatar')).toHaveAttribute('src', 'https://img/current.jpg')
  })

  it('uploads the selected file and previews the new avatar', async () => {
    const uploadAvatar = vi.fn().mockResolvedValue('https://img/uploaded.jpg')
    vi.mocked(useChannelAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar
    } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Channel Avatar'), {
      target: { files: [new File(['data'], 'photo.png', { type: 'image/png' })] }
    })

    await waitFor(() => {
      expect(uploadAvatar).toHaveBeenCalled()
      expect(screen.getByAltText('Channel avatar')).toHaveAttribute('src', 'https://img/uploaded.jpg')
    })
  })

  it('rejects non-image file selections', async () => {
    const uploadAvatar = vi.fn()
    vi.mocked(useChannelAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar
    } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Channel Avatar'), {
      target: { files: [new File(['data'], 'notes.txt', { type: 'text/plain' })] }
    })

    expect(await screen.findByText('Please choose an image file.')).toBeInTheDocument()
    expect(uploadAvatar).not.toHaveBeenCalled()
  })

  it('shows the upload error message on failure', async () => {
    const uploadAvatar = vi.fn().mockRejectedValue(new Error('Image is too large (max 5 MB)'))
    vi.mocked(useChannelAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar
    } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Channel Avatar'), {
      target: { files: [new File(['data'], 'photo.png', { type: 'image/png' })] }
    })

    expect(await screen.findByText('Image is too large (max 5 MB)')).toBeInTheDocument()
  })

  it('disables the input and shows a note when uploads are disabled by the admin', () => {
    vi.mocked(useChannelAvatar).mockReturnValue({
      uploadEnabled: false,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: vi.fn()
    } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    expect(screen.getByLabelText('Channel Avatar')).toBeDisabled()
    expect(screen.getByText(/Image uploads are disabled by the server admin/)).toBeInTheDocument()
  })
})
