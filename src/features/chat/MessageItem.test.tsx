import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MessageItem } from './MessageItem'

describe('MessageItem', () => {
  it('renders system message correctly', () => {
    const msg: any = { type: 'system', content: 'Hero joined the game' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Hero joined the game')).toBeInTheDocument()
  })

  it('renders scene message correctly', () => {
    const msg: any = { type: 'scene', content: 'You enter a dark tavern' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('You enter a dark tavern')).toBeInTheDocument()
  })

  it('renders regular message with markdown', () => {
    const msg: any = { 
      type: 'regular', 
      content: '**Bold** text',
      created_at: new Date().toISOString(),
      sender_id: 'u2',
      sender: { display_name: 'Hero' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    expect(screen.getByText('Hero')).toBeInTheDocument()
  })

  it('allows editing if author and within 15 min', async () => {
    const mockOnEdit = vi.fn().mockResolvedValue(undefined)
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Oops',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    
    // We can't directly get the SVG button by text, so we can mock its behavior or use container query
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={mockOnEdit} onDelete={vi.fn()} />)
    
    // Find edit button (first button is edit, second is delete)
    const buttons = container.querySelectorAll('button')
    fireEvent.click(buttons[0])
    
    const textarea = screen.getByDisplayValue('Oops')
    fireEvent.change(textarea, { target: { value: 'Fixed' } })
    fireEvent.click(screen.getByText('Save'))
    
    await waitFor(() => {
      expect(mockOnEdit).toHaveBeenCalledWith('m1', 'Fixed')
    })
  })

  it('allows delete if GM', () => {
    const mockOnDelete = vi.fn()
    window.confirm = vi.fn().mockReturnValue(true)
    
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Bad message',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={vi.fn()} onDelete={mockOnDelete} />)
    
    const buttons = container.querySelectorAll('button')
    // GM can't edit someone else's, so there is only 1 button (delete)
    expect(buttons.length).toBe(1)
    fireEvent.click(buttons[0])
    
    expect(mockOnDelete).toHaveBeenCalledWith('m1')
  })

  it('handles edit error gracefully', async () => {
    const mockOnEdit = vi.fn().mockRejectedValue(new Error('Edit failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Oops',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={mockOnEdit} onDelete={vi.fn()} />)
    
    fireEvent.click(container.querySelectorAll('button')[0]) // Edit
    
    const textarea = screen.getByDisplayValue('Oops')
    fireEvent.change(textarea, { target: { value: 'Fixed' } })
    fireEvent.click(screen.getByText('Save'))
    
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('handles delete error gracefully', async () => {
    const mockOnDelete = vi.fn().mockRejectedValue(new Error('Delete failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.confirm = vi.fn().mockReturnValue(true)
    
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Bad',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={mockOnDelete} />)
    
    fireEvent.click(container.querySelectorAll('button')[1]) // Delete
    
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('renders deleted message correctly', () => {
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Bad',
      created_at: new Date().toISOString(),
      sender_id: 'u1',
      is_deleted: true
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('This message was deleted.')).toBeInTheDocument()
    expect(container.querySelectorAll('button').length).toBe(0) // No edit/delete buttons
  })

  it('renders whisper message correctly', () => {
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Secret',
      created_at: new Date().toISOString(),
      sender_id: 'u1',
      whisper_to: 'u2',
      whisper_target: { display_name: 'Target' }
    }
    render(<MessageItem message={msg} currentUserId="u2" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Secret')).toBeInTheDocument()
    expect(screen.getByText('Whisper to You')).toBeInTheDocument()

    // Render from sender's perspective where whisper_to != currentUserId
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getAllByText('Whisper to Target')[0]).toBeInTheDocument()
  })

  it('cancels edit mode', () => {
    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Oops',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(container.querySelectorAll('button')[0]) // Edit
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })
})
