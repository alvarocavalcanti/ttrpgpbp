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
    expect(screen.queryByText('Attributes (Modifiers)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
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
    expect(screen.getByText('Attributes (Modifiers)')).toBeInTheDocument()
    
    fireEvent.change(screen.getByLabelText('STR'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Save'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        attributes: expect.objectContaining({ STR: 3 })
      }))
    })
  })

  it('clamps Shadowdark modifiers to [-4, 4]', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)
    
    fireEvent.change(screen.getByLabelText('STR'), { target: { value: '6' } })
    fireEvent.click(screen.getByText('Save'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        attributes: expect.objectContaining({ STR: 4 })
      }))
    })
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
})
