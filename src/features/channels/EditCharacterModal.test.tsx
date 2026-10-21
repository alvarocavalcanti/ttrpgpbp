import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditCharacterModal } from './EditCharacterModal'
import { useCharacterAvatar } from './useCharacterAvatar'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

vi.mock('./useCharacterAvatar', () => ({
  useCharacterAvatar: vi.fn(),
}))

const CHANNEL_ID = '11111111-2222-3333-4444-555555555555'

describe('EditCharacterModal', () => {
  const mockMember = { id: 'm1', channel_id: CHANNEL_ID, character_name: 'Hero', character_sheet_url: '', attributes: {} } as any

  const uploadPortrait = vi.fn()
  const removePortrait = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    uploadPortrait.mockResolvedValue('chan/character/new.jpg')
    removePortrait.mockResolvedValue(undefined)
    vi.mocked(useCharacterAvatar).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadPortrait,
      removePortrait,
    })
  })

  it('renders generic modal', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('Hero')).toBeInTheDocument()
    expect(screen.queryByText('Stat Modifiers')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
  })

  it('lays the dialog panel above the dark backdrop (#510)', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)
    // The panel must be positioned (`relative`), otherwise the fixed backdrop
    // paints over it and the dark-mode panel renders near-black.
    expect(screen.getByTestId('edit-character-panel').className).toContain('relative')
  })

  it('renders as a bottom sheet when asSheet is set', () => {
    const onClose = vi.fn()
    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={onClose} onUpdate={vi.fn()} asSheet />)

    // BottomSheet wrapper supplies the dialog + title
    const sheet = screen.getByRole('dialog', { name: 'Edit Character' })
    expect(sheet).toBeInTheDocument()
    expect(screen.getByLabelText('Character Name')).toBeInTheDocument()
    // No duplicate centered-dialog heading
    expect(screen.getAllByText('Edit Character')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close options' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('limits character name input to 20 characters', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText('Character Name')).toHaveAttribute('maxlength', '20')
    expect(screen.getByLabelText('Sheet URL')).toHaveAttribute('maxlength', '500')
  })

  it('renders Shadowdark modal and updates stats', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Stat Modifiers')).toBeInTheDocument()
    expect(screen.getByText('Shadowdark modifiers range from -4 to 4')).toBeInTheDocument()
    
    fireEvent.change(screen.getByLabelText('STR'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Save'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        attributes: expect.objectContaining({ STR: 3 })
      }))
    })
  })

  it('flags out-of-range input in red and blocks save', () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)

    const strInput = screen.getByLabelText('STR')
    const subTitle = screen.getByText('Shadowdark modifiers range from -4 to 4')
    expect(subTitle).not.toHaveClass('text-red-600')
    expect(strInput).not.toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(strInput, { target: { value: '16' } })

    expect(strInput).toHaveAttribute('aria-invalid', 'true')
    expect(strInput.className).toContain('border-red-500')
    expect(subTitle).toHaveClass('text-red-600')
    expect(screen.getByText('Save')).toBeDisabled()

    fireEvent.change(strInput, { target: { value: '-2' } })
    expect(strInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(subTitle).not.toHaveClass('text-red-600')
    expect(screen.getByText('Save')).toBeEnabled()
  })

  it('sanitizes legacy garbage values on load', () => {
    const dirtyMember = {
      ...mockMember,
      attributes: { STR: 1e79, DEX: 2.9292, CON: '-3', INT: 'abc', WIS: null },
    } as any

    render(<EditCharacterModal member={dirtyMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)

    // Exponent/float/garbage reset to 0; in-range ints kept.
    expect(screen.getByLabelText('STR')).not.toHaveValue('1e+79')
    expect(screen.getByLabelText('DEX')).toHaveValue('0')
    expect(screen.getByLabelText('INT')).toHaveValue('0')
    expect(screen.getByLabelText('WIS')).toHaveValue('0')
    expect(screen.getByLabelText('CON')).toHaveValue('-3')
  })

  it('ignores non-integer keystrokes in stat fields', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)

    const strInput = screen.getByLabelText('STR')
    expect(strInput).toHaveValue('0')

    // Floats, exponents, and stray characters are rejected.
    fireEvent.change(strInput, { target: { value: '1.5' } })
    expect(strInput).toHaveValue('0')
    fireEvent.change(strInput, { target: { value: 'e3' } })
    expect(strInput).toHaveValue('0')
    fireEvent.change(strInput, { target: { value: 'abc' } })
    expect(strInput).toHaveValue('0')
    fireEvent.change(strInput, { target: { value: 'x' } })
    expect(strInput).toHaveValue('0')
  })

  it('accepts a leading minus and digits', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)

    const strInput = screen.getByLabelText('STR')
    fireEvent.change(strInput, { target: { value: '-3' } })
    expect(strInput).toHaveValue('-3')
  })

  it('saves notes as trimmed plain text and nulls empty notes', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={{ ...mockMember, character_notes: '  old  ' }} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '  Backstory here.  ' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        character_notes: 'Backstory here.'
      }))
    })
  })

  it('blocks saving an explicit non-http(s) sheet scheme with an inline error', async () => {
    const mockUpdate = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Sheet URL'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Sheet link must start with http:// or https://.')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('saves an https sheet url', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Sheet URL'), { target: { value: 'https://example.com/sheet' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        character_sheet_url: 'https://example.com/sheet'
      }))
    })
  })

  // #743: per-channel character portrait.
  it('shows the channel portrait when there is one', () => {
    const { container } = render(
      <EditCharacterModal
        member={{ ...mockMember, character_avatar_url: 'https://example.com/hero.png' }}
        gameSystem="none"
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    )
    expect(container.querySelector('img[src="https://example.com/hero.png"]')).not.toBeNull()
    // A portrait hides the Remove button only until one exists; here it does.
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('falls back to the account picture, then to the character initial', () => {
    const { container: withProfile } = render(
      <EditCharacterModal
        member={{ ...mockMember, profile: { display_name: 'Player', avatar_url: 'https://example.com/me.png' } }}
        gameSystem="none"
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    )
    expect(withProfile.querySelector('img[src="https://example.com/me.png"]')).not.toBeNull()

    const { container: withInitial } = render(
      <EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />
    )
    expect(withInitial.querySelector('img')).toBeNull()
    expect(withInitial.textContent).toContain('H')
    // No portrait yet: nothing to remove.
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('uploads a new portrait and keeps the dialog open', async () => {
    const { container } = render(
      <EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />
    )

    const file = new File([new Uint8Array(10)], 'portrait.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Character portrait'), { target: { files: [file] } })

    await waitFor(() => expect(uploadPortrait).toHaveBeenCalledWith(file))
    expect(screen.getByText('Character Name')).toBeInTheDocument()
    expect(container.querySelector('img[src="chan/character/new.jpg"]')).not.toBeNull()
  })

  it('shows an inline error and stores nothing when the upload fails', async () => {
    uploadPortrait.mockRejectedValue(new Error('Image is too large (max 5 MB)'))
    const mockUpdate = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)

    const file = new File([new Uint8Array(10)], 'portrait.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Character portrait'), { target: { files: [file] } })

    expect(await screen.findByText('Image is too large (max 5 MB)')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('disables the upload control when the server admin turned uploads off', () => {
    vi.mocked(useCharacterAvatar).mockReturnValue({
      uploadEnabled: false,
      settingsLoading: false,
      uploading: false,
      uploadPortrait,
      removePortrait,
    })

    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled()
    expect(screen.getByText('Image uploads are disabled by the server admin.')).toBeInTheDocument()
  })

  it('removes the portrait and falls back to the account picture', async () => {
    const { container } = render(
      <EditCharacterModal
        member={{
          ...mockMember,
          character_avatar_url: 'https://example.com/hero.png',
          profile: { display_name: 'Player', avatar_url: 'https://example.com/me.png' },
        }}
        gameSystem="none"
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(removePortrait).toHaveBeenCalled())
    await waitFor(() => {
      expect(container.querySelector('img[src="https://example.com/hero.png"]')).toBeNull()
    })
    expect(container.querySelector('img[src="https://example.com/me.png"]')).not.toBeNull()
  })

  it('never writes the portrait when the character form is saved', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(
      <EditCharacterModal
        member={{ ...mockMember, character_avatar_url: 'https://example.com/hero.png' }}
        gameSystem="none"
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
    expect(Object.keys(mockUpdate.mock.calls[0][0])).not.toContain('character_avatar_url')
  })
})
