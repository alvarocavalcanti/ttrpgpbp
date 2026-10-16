import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChannelSettings } from './ChannelSettings'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
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

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
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
    // The join-request queue reads channel_join_requests; default to none so the
    // tests that do not care about the queue see the empty state.
    vi.mocked(supabase.from).mockImplementation((() => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.order = () => Promise.resolve({ data: [], error: null })
      // eslint-disable-next-line unicorn/no-thenable
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    }) as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders correctly', () => {
    render(<ChannelSettings channel={mockChannel} gmOnlyResourcesUrl="http://gmresources" onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    expect(screen.getByDisplayValue('Game Room')).toBeInTheDocument()
    expect(screen.getByLabelText('Channel Name')).toHaveAttribute('maxLength', '80')
    expect(screen.getByDisplayValue('http://map')).toBeInTheDocument()
    expect(screen.getByLabelText('Map URL')).toHaveAttribute('maxLength', '500')
    expect(screen.getByDisplayValue('http://gmresources')).toBeInTheDocument()
    expect(screen.getByLabelText('GM-Only Resources URL')).toHaveAttribute('maxLength', '500')
    expect(screen.getByDisplayValue('http://localhost/join/c1?code=123')).toBeInTheDocument()
  })

  it('shows the password as set when hasPassword is true', () => {
    render(
      <ChannelSettings channel={mockChannel} hasPassword onClose={vi.fn()} onUpdate={vi.fn()} />,
      { wrapper: MemoryRouter }
    )

    expect(screen.getByText('Password is set (hidden)')).toBeInTheDocument()
    expect(screen.queryByText('No password currently set')).not.toBeInTheDocument()
  })

  it('shows no password when hasPassword is false', () => {
    render(
      <ChannelSettings channel={mockChannel} hasPassword={false} onClose={vi.fn()} onUpdate={vi.fn()} />,
      { wrapper: MemoryRouter }
    )

    expect(screen.getByText('No password currently set')).toBeInTheDocument()
    expect(screen.queryByText('Password is set (hidden)')).not.toBeInTheDocument()
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
        p_safety_tools_url: undefined,
        p_gm_only_resources_url: 'http://gmresources',
        p_clear_password: false,
        p_safety_lines: undefined,
        p_safety_veils: undefined
      }))
      expect(mockAddToast).toHaveBeenCalledWith('Channel settings saved successfully', 'success')
      expect(mockOnUpdate).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('rejects non-http(s) URLs before calling the RPC', () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.change(screen.getByLabelText('Map URL'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(mockRpc).not.toHaveBeenCalled()
    expect(screen.getByText('Links must start with http:// or https://')).toBeInTheDocument()
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
        p_safety_lines: undefined,
        p_safety_veils: undefined
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
        p_password_hash: undefined,
        p_password_salt: undefined
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
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Archive Channel'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive this channel?' })).getByRole('button', { name: 'Archive' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_archived: true })
    })
  })

  it('handles archive channel error', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('DB Error') }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })

    fireEvent.click(screen.getByText('Archive Channel'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive this channel?' })).getByRole('button', { name: 'Archive' }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Failed to archive channel.', 'error')
    })
  })

  it('handles export chat error', async () => {
    const range = vi.fn().mockResolvedValue({ data: null, error: new Error('err') })
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ range }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Failed to export channel.', 'error')
    })
  })

  it('exports all messages past the 1000-row cap via pagination', async () => {
    const messages = Array.from({ length: 1500 }).map((_, i) => ({ content: `msg ${i}`, created_at: '2023-01-01', sender: { display_name: 'test' }, type: 'regular' }))
    const range = vi.fn().mockImplementation((from: number, to: number) =>
      Promise.resolve({ data: messages.slice(from, to + 1), error: null }),
    )
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ range }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Chat exported successfully', 'success')
      expect(range).toHaveBeenCalledTimes(2)
    })
  })

  it('handles export chat', async () => {
    // Basic coverage for the button click
    const range = vi.fn().mockResolvedValue({ data: [{ content: 'msg', created_at: '2023-01-01', sender: { display_name: 'test' } }], error: null })
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ range }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
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

  describe('Discovery and join requests (#674)', () => {
    const listedChannel = {
      ...mockChannel,
      join_mode: 'approval',
      description: 'A weekly Shadowdark game.',
      constraints: 'Post most days.',
      application_prompt: 'Why do you want to join?',
    }

    const pendingRequest = {
      id: 'r1',
      channel_id: 'c1',
      user_id: 'u1',
      character_name: 'Aria',
      message: 'I have been looking for a weekly game.',
      status: 'pending',
      created_at: '2026-10-15T10:00:00Z',
    }

    // The join-request queue reads channel_join_requests directly.
    function requestChain(result: { data: unknown; error: unknown }) {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.order = () => Promise.resolve(result)
      // eslint-disable-next-line unicorn/no-thenable
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return chain
    }

    function renderSettings(channel: any = { ...mockChannel, join_mode: 'invite' }) {
      const onClose = vi.fn()
      const onUpdate = vi.fn()
      render(<ChannelSettings channel={channel} onClose={onClose} onUpdate={onUpdate} />, { wrapper: MemoryRouter })
      return { onClose, onUpdate }
    }

    it('starts private and reveals the listing copy only when listed', () => {
      renderSettings()

      expect(screen.getByRole('button', { name: /Private — invite link only/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Listed — apply to join/ }))

      expect(screen.getByLabelText('Description')).toBeInTheDocument()
      expect(screen.getByLabelText('What you expect')).toBeInTheDocument()
      expect(screen.getByLabelText('Application prompt (optional)')).toBeInTheDocument()
      expect(screen.getByText(/Publicly listed and search-engine indexable/)).toBeInTheDocument()
    })

    it('caps the listing copy at input, matching the server', () => {
      renderSettings(listedChannel)

      expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '600')
      expect(screen.getByLabelText('What you expect')).toHaveAttribute('maxlength', '600')
      expect(screen.getByLabelText('Application prompt (optional)')).toHaveAttribute('maxlength', '300')
    })

    it('rejects a publish with blank copy inline, without calling the server', () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockImplementation(mockRpc)
      renderSettings()

      fireEvent.click(screen.getByRole('button', { name: /Listed — apply to join/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

      expect(screen.getByRole('alert')).toHaveTextContent('A listed channel needs both a description and constraints.')
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('publishes the listing fields and fires listing_publish on the transition', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockImplementation(mockRpc)
      renderSettings()

      fireEvent.click(screen.getByRole('button', { name: /Listed — apply to join/ }))
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A weekly game.' } })
      fireEvent.change(screen.getByLabelText('What you expect'), { target: { value: 'Be kind.' } })
      fireEvent.change(screen.getByLabelText('Application prompt (optional)'), { target: { value: 'Why?' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith(
          'update_channel_settings',
          expect.objectContaining({
            p_channel_id: 'c1',
            p_join_mode: 'approval',
            p_description: 'A weekly game.',
            p_constraints: 'Be kind.',
            p_application_prompt: 'Why?',
          }),
        ),
      )
      expect(trackEvent).toHaveBeenCalledWith('listing_publish', { game_system: 'none' })
    })

    it('does not re-fire listing_publish when an already-listed channel is edited', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockImplementation(mockRpc)
      renderSettings(listedChannel)

      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A renamed weekly game.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

      await waitFor(() => expect(mockRpc).toHaveBeenCalled())
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('confirms before removing the listing, and keeps it when cancelled', () => {
      renderSettings(listedChannel)

      fireEvent.click(screen.getByRole('button', { name: /Private — invite link only/ }))
      const dialog = screen.getByRole('dialog', { name: 'Remove this listing?' })

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: /Listed — apply to join/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('dialog', { name: 'Remove this listing?' })).not.toBeInTheDocument()
    })

    it('removes the listing when the confirm is accepted', () => {
      renderSettings(listedChannel)

      fireEvent.click(screen.getByRole('button', { name: /Private — invite link only/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove listing' }))

      expect(screen.getByRole('button', { name: /Private — invite link only/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()
    })

    it('warns about the pending applications a delist will close', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: [pendingRequest], error: null }) as any,
      )
      renderSettings(listedChannel)

      // Wait for the queue so the confirm knows how many applications it closes.
      await screen.findByText('Join requests (1)')
      fireEvent.click(screen.getByRole('button', { name: /Private — invite link only/ }))

      expect(screen.getByRole('dialog', { name: 'Remove this listing?' })).toHaveTextContent(
        'its 1 pending application is closed',
      )
    })

    it('does not ask to confirm when the channel was never listed', () => {
      renderSettings()

      // Toggle to Listed and back without saving: nothing was ever published,
      // so there is no delist to confirm.
      fireEvent.click(screen.getByRole('button', { name: /Listed — apply to join/ }))
      fireEvent.click(screen.getByRole('button', { name: /Private — invite link only/ }))

      expect(screen.queryByRole('dialog', { name: 'Remove this listing?' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Private — invite link only/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('still names the pending applications a delist closes when the queue did not load', () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: null, error: new Error('down') }) as any,
      )
      renderSettings(listedChannel)

      fireEvent.click(screen.getByRole('button', { name: /Private — invite link only/ }))

      // The count is unknown, but a destructive action must not understate it.
      expect(screen.getByRole('dialog', { name: 'Remove this listing?' })).toHaveTextContent(
        'any pending applications it has are closed',
      )
    })

    it('lists pending applications and approves one without submitting the form', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: [pendingRequest], error: null }) as any,
      )
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockImplementation(mockRpc)
      const { onUpdate } = renderSettings(listedChannel)

      expect(await screen.findByText('Join requests (1)')).toBeInTheDocument()
      expect(screen.getByText('Aria')).toBeInTheDocument()
      expect(screen.getByText('I have been looking for a weekly game.')).toBeInTheDocument()
      expect(screen.getByText(/^Applied /)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('decide_join_request', {
          p_request_id: 'r1',
          p_approve: true,
        }),
      )
      // The queue buttons must not submit the enclosing settings form.
      expect(mockRpc).not.toHaveBeenCalledWith('update_channel_settings', expect.anything())
      expect(mockAddToast).toHaveBeenCalledWith('Application approved', 'success')
      expect(trackEvent).toHaveBeenCalledWith('join_request_decide', { decision: 'approve' })
      expect(onUpdate).toHaveBeenCalled()
    })

    it('fires the decision event for a rejection too', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: [pendingRequest], error: null }) as any,
      )
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockImplementation(mockRpc)
      renderSettings(listedChannel)

      fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('decide_join_request', {
          p_request_id: 'r1',
          p_approve: false,
        }),
      )
      expect(trackEvent).toHaveBeenCalledWith('join_request_decide', { decision: 'reject' })
    })

    it('surfaces the server message when a decision fails', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: [pendingRequest], error: null }) as any,
      )
      vi.mocked(supabase.rpc).mockResolvedValue({ error: { message: 'This channel is archived.' } } as any)
      renderSettings(listedChannel)

      fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

      await waitFor(() =>
        expect(mockAddToast).toHaveBeenCalledWith('This channel is archived.', 'error'),
      )
    })

    it('shows the empty queue state', async () => {
      renderSettings(listedChannel)

      expect(await screen.findByText('Join requests (0)')).toBeInTheDocument()
      expect(screen.getByText('No pending requests.')).toBeInTheDocument()
    })

    it('aligns the decision buttons with the middle of a long answer', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: [pendingRequest], error: null }) as any,
      )
      renderSettings(listedChannel)

      // A wrapped answer makes the row taller than the buttons; the button
      // column centres itself instead of sticking to the top (#722). The
      // buttons must centre their own labels inside the 44px touch target too,
      // or the text sits at the top of the box.
      const approve = await screen.findByRole('button', { name: 'Approve' })
      const buttons = approve.parentElement
      expect(buttons).toHaveClass('self-center')
      expect(buttons).toHaveClass('items-center')
      expect(approve).toHaveClass('items-center')
      expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('items-center')
    })

    it('offers Retry when the queue cannot be loaded', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => requestChain({ data: null, error: new Error('down') }) as any,
      )
      renderSettings(listedChannel)

      expect(await screen.findByText("Couldn't load requests.")).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await waitFor(() => expect(supabase.from).toHaveBeenCalledTimes(2))
    })
  })
})
