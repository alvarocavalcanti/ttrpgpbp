import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChannelSettings } from './ChannelSettings'
import { supabase } from '../../lib/supabase'
import { useChannelAvatar } from './useChannelAvatar'
import { useImageUpload } from '../../hooks/useImageUpload'

const { mockUploadImage } = vi.hoisted(() => ({ mockUploadImage: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('./useChannelAvatar', () => ({
  useChannelAvatar: vi.fn()
}))

vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: vi.fn(() => ({
    uploadEnabled: true,
    settingsLoading: false,
    uploading: false,
    uploadImage: mockUploadImage,
  })),
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

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddToast.mockClear()
    vi.mocked(useChannelAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadAvatar: vi.fn().mockResolvedValue('https://img/new.jpg')
    } as any)
    mockUploadImage.mockReset()
    mockUploadImage.mockResolvedValue('https://supabase/images/c1/map/u.jpg')
    vi.mocked(useImageUpload).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadImage: mockUploadImage,
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

  it('saves changes through update_channel_settings', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    const mockOnUpdate = vi.fn()
    const mockOnClose = vi.fn()

    render(<ChannelSettings channel={mockChannel} gmOnlyResourcesUrl="http://gmresources" onClose={mockOnClose} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_channel_settings', expect.objectContaining({
        p_channel_id: 'c1',
        p_name: 'New Name',
        p_game_system: 'none',
        p_map_url: 'http://map',
        p_resources_url: 'http://resources',
        p_safety_tools_url: null,
        p_gm_only_resources_url: 'http://gmresources',
        p_clear_password: false,
        p_safety_lines: null,
        p_safety_veils: null
      }))
      expect(mockAddToast).toHaveBeenCalledWith('Channel settings saved successfully', 'success')
      expect(mockOnUpdate).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('saves changes with password update', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)

    const mockOnUpdate = vi.fn()
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Change Password'))
    
    const pwInput = screen.getByPlaceholderText('Leave blank to remove password')
    fireEvent.change(pwInput, { target: { value: 'new_secret' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_channel_settings', expect.objectContaining({
        p_password_hash: 'hashed_password',
        p_password_salt: 'salt_value',
        p_clear_password: false
      }))
    })
  })

  it('saves safety tools lines, veils, and URL', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    const mockSafetySelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })
    })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSafetySelect } as any)
    const mockOnUpdate = vi.fn()

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Safety Tools (Lines & Veils)'))
    fireEvent.change(screen.getByLabelText('Lines'), { target: { value: 'no gore' } })
    fireEvent.change(screen.getByLabelText('Veils'), { target: { value: 'romance' } })
    fireEvent.change(screen.getByLabelText('Safety Tools URL'), { target: { value: 'https://docs.google.com/doc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_channel_settings', expect.objectContaining({
        p_safety_tools_url: 'https://docs.google.com/doc',
        p_safety_lines: 'no gore',
        p_safety_veils: 'romance'
      }))
    })
  })

  it('does not save safety tools unless the section was opened', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_channel_settings', expect.objectContaining({
        p_safety_lines: null,
        p_safety_veils: null
      }))
    })
  })

  it('clears the password when Change Password is on and the field is blank', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Change Password'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_channel_settings', expect.objectContaining({
        p_clear_password: true,
        p_password_hash: null,
        p_password_salt: null
      }))
    })
  })

  it('shows an error toast when saving fails', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('Update failed') })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

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

  it('uploads a map image and fills the Map URL field', async () => {
    mockUploadImage.mockResolvedValue('https://supabase/images/c1/map/u.jpg')
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Upload map image'), {
      target: { files: [new File(['data'], 'dungeon.png', { type: 'image/png' })] }
    })

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledWith(expect.any(File), 'map')
      expect(screen.getByLabelText('Map URL')).toHaveValue('https://supabase/images/c1/map/u.jpg')
    })
  })

  it('uploads a resources image and fills the Resources URL field', async () => {
    mockUploadImage.mockResolvedValue('https://supabase/images/c1/resources/u.jpg')
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Upload resources image'), {
      target: { files: [new File(['data'], 'handout.png', { type: 'image/png' })] }
    })

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledWith(expect.any(File), 'resources')
      expect(screen.getByLabelText('Resources URL')).toHaveValue('https://supabase/images/c1/resources/u.jpg')
    })
  })

  it('shows the map upload error on failure', async () => {
    mockUploadImage.mockRejectedValue(new Error('Image uploads are disabled by the server admin'))
    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Upload map image'), {
      target: { files: [new File(['data'], 'dungeon.png', { type: 'image/png' })] }
    })

    expect(await screen.findByText('Image uploads are disabled by the server admin')).toBeInTheDocument()
  })
})
