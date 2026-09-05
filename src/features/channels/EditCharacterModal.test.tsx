import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EditCharacterModal } from './EditCharacterModal'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('EditCharacterModal', () => {
  const mockMember = { id: 'm1', character_name: 'Hero', character_sheet_url: '', attributes: {} } as any

  it('renders generic modal', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('Hero')).toBeInTheDocument()
    expect(screen.queryByText('Stat Modifiers')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
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
})
