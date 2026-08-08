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
  })

  it('limits character name input to 20 characters', () => {
    render(<EditCharacterModal member={mockMember} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText('Character Name')).toHaveAttribute('maxlength', '20')
  })

  it('renders Shadowdark modal and updates stats', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Attributes (Modifiers)')).toBeInTheDocument()
    
    const strInput = screen.getByLabelText('STR')
    fireEvent.change(strInput, { target: { value: '3' } })
    
    fireEvent.click(screen.getByText('Save'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        attributes: { STR: 3 }
      }))
    })
  })
})
