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

  it('renders dice_roll message correctly', () => {
    const msg: any = { 
      type: 'dice_roll', 
      content: 'Rolled 1d20: **15**',
      sender: { display_name: 'Hero' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Hero rolled dice')).toBeInTheDocument()
    expect(screen.getByText('15').tagName).toBe('STRONG')
  })

  it('shows the reply context on a dice_roll message and jumps to the source', () => {
    const mockOnJump = vi.fn()
    const msg: any = {
      id: 'r1',
      type: 'dice_roll',
      content: 'Rolled 1d20: **7**',
      sender: { display_name: 'Hero' },
      reply: { id: 'm1', content: 'Roll a STR Check', sender_id: 'u2', is_deleted: false, type: 'regular' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onJumpToMessage={mockOnJump} members={[{ user_id: 'u2', character_name: 'GM' }]} />)
    expect(screen.getByText('Replying to GM')).toBeInTheDocument()
    expect(screen.getByText('Roll a STR Check')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Replying to GM'))
    expect(mockOnJump).toHaveBeenCalledWith('m1')
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

  it('handles ability checks and sends dice roll', () => {
    const mockOnRollDice = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('3') // +3 modifier

    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    
    const checkBtn = screen.getByRole('button', { name: 'STR Check' })
    fireEvent.click(checkBtn)
    
    expect(window.prompt).toHaveBeenCalledWith('Enter modifier for STR Check:', '0')
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20+3', 'm1')
  })

  it('handles ability checks with negative modifiers', () => {
    const mockOnRollDice = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('-2') 

    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Make a DEX Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'DEX Check' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20-2', 'm1')
  })

  it('handles ability checks with zero modifiers', () => {
    const mockOnRollDice = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('0') 

    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'STR Check' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1')
  })

  it('handles ability checks with invalid modifiers', () => {
    const mockOnRollDice = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('abc') 

    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'STR Check' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1')
  })

  it('handles ability checks when prompt is cancelled', () => {
    const mockOnRollDice = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue(null) // user clicked cancel

    const msg: any = { 
      id: 'm1',
      type: 'regular', 
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'STR Check' }))
    
    expect(mockOnRollDice).not.toHaveBeenCalled()
  })

  it('passes the source message id when rolling an inline dice notation', () => {
    const mockOnRollDice = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Roll 1d20 now',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    fireEvent.click(screen.getByRole('button', { name: '1d20' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1')
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
      expect(screen.getByText('Failed to edit message.')).toBeInTheDocument()
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
      expect(screen.getByText('Failed to delete message.')).toBeInTheDocument()
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

  it('renders img correctly with secure attributes', () => {
    const msg: any = { 
      type: 'regular', 
      content: '![Alt text](https://example.com/test.png)',
      created_at: new Date().toISOString(),
      sender_id: 'u2',
      sender: { display_name: 'Hero' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    
    const img = screen.getByRole('img', { name: 'Alt text' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/test.png')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('sanitizes insecure URLs', () => {
    const msg: any = {
      type: 'regular',
      content: '[Bad Link](javascript:alert(1)) and ![Bad Image](javascript:alert(2))',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    
    const link = screen.getByText('Bad Link')
    expect(link).toHaveAttribute('href', '')
    
    const img = screen.getByRole('img', { name: 'Bad Image' })
    expect(img.getAttribute('src')).toBeFalsy()
  })

  it('renders check correctly for Shadowdark missing modifier', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('3'))
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[DEX Check](check:DEX)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: {}}]} />)
    fireEvent.click(screen.getByText('DEX Check'))
    expect(mockOnRoll).toHaveBeenCalledWith(expect.stringContaining('1d20+3'), 'm1')
  })

  it('renders check correctly for Shadowdark with modifier', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: 4 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+4', 'm1')
  })

  it('renders mention chips for user: links', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: '[@Hero](user:u1) is here',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('@Hero')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders reply block and jumps to parent on click', () => {
    const mockOnJump = vi.fn()
    const msg: any = {
      id: 'm2',
      type: 'regular',
      content: 'my reply',
      created_at: new Date().toISOString(),
      sender_id: 'u2',
      reply: { id: 'm1', content: 'original text', sender_id: 'u1', is_deleted: false, type: 'regular' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onJumpToMessage={mockOnJump} members={[{ user_id: 'u1', character_name: 'Hero' }]} />)
    expect(screen.getByText('Replying to Hero')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Replying to Hero'))
    expect(mockOnJump).toHaveBeenCalledWith('m1')
  })

  it('renders deleted parent reply as deleted placeholder', () => {
    const msg: any = {
      id: 'm2',
      type: 'regular',
      content: 'my reply',
      created_at: new Date().toISOString(),
      sender_id: 'u2',
      reply: { id: 'm1', content: 'gone', sender_id: 'u1', is_deleted: true, type: 'regular' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('This message was deleted.')).toBeInTheDocument()
  })

  it('renders reactions and toggles on click', () => {
    const mockOnToggle = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(
      <MessageItem
        message={msg}
        currentUserId="u1"
        isGM={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        reactions={[{ emoji: '👍', count: 2, hasReacted: true }]}
        onToggleReaction={mockOnToggle}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Reaction 👍, 2/ }))
    expect(mockOnToggle).toHaveBeenCalledWith('m1', '👍')
  })

  it('opens emoji picker and adds reaction', () => {
    const mockOnToggle = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={mockOnToggle} />)
    fireEvent.click(screen.getByLabelText('Add reaction'))
    fireEvent.click(screen.getByText('👍'))
    expect(mockOnToggle).toHaveBeenCalledWith('m1', '👍')
  })

  it('calls onReply when reply button clicked', () => {
    const mockOnReply = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={mockOnReply} />)
    fireEvent.click(screen.getByLabelText('Reply'))
    expect(mockOnReply).toHaveBeenCalledWith(msg)
  })

})
