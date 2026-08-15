import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MessageItem } from './MessageItem'

describe('MessageItem', () => {
  it('renders system message correctly', () => {
    const msg: any = { type: 'system', content: 'Hero joined the game' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Hero joined the game')).toBeInTheDocument()
  })

  it('renders NPC message with NPC name and portrait', () => {
    const msg: any = {
      type: 'npc',
      content: 'Trespassers!',
      npc_name: 'Goblin King',
      npc_avatar_url: 'https://example.com/king.png',
      created_at: new Date().toISOString(),
      sender_id: 'gm1'
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Goblin King')).toBeInTheDocument()
    expect(screen.getByText('Trespassers!')).toBeInTheDocument()
    const avatar = container.querySelector('img[src="https://example.com/king.png"]')
    expect(avatar).not.toBeNull()
  })

  it('allows the GM author to edit an NPC message within the edit window', async () => {
    const mockOnEdit = vi.fn().mockResolvedValue(undefined)
    window.confirm = vi.fn().mockReturnValue(true)
    const msg: any = {
      id: 'n1',
      type: 'npc',
      content: 'Trespassers!',
      npc_name: 'Goblin King',
      npc_avatar_url: 'https://example.com/king.png',
      created_at: new Date().toISOString(),
      sender_id: 'gm1'
    }
    render(<MessageItem message={msg} currentUserId="gm1" isGM={true} onEdit={mockOnEdit} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Edit'))
    fireEvent.change(screen.getByDisplayValue('Trespassers!'), { target: { value: 'Intruders!' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mockOnEdit).toHaveBeenCalledWith('n1', 'Intruders!'))
  })

  it('renders scene message correctly', () => {
    const msg: any = { type: 'scene', content: 'You enter a dark tavern' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('You enter a dark tavern')).toBeInTheDocument()
  })

  it('allows GM to edit and delete a scene message', async () => {
    const mockOnEdit = vi.fn().mockResolvedValue(undefined)
    const mockOnDelete = vi.fn().mockResolvedValue(undefined)
    window.confirm = vi.fn().mockReturnValue(true)
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u1' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    expect(screen.getByText('You enter a dark tavern')).toBeInTheDocument()

    // GM can delete
    const deleteBtn = screen.getByLabelText('Delete')
    fireEvent.click(deleteBtn)
    await waitFor(() => expect(mockOnDelete).toHaveBeenCalledWith('s1'))

    // GM can edit
    fireEvent.click(screen.getByLabelText('Edit'))
    const textarea = screen.getByDisplayValue('You enter a dark tavern')
    fireEvent.change(textarea, { target: { value: 'A storm rolls in' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mockOnEdit).toHaveBeenCalledWith('s1', 'A storm rolls in'))
  })

  it('does not show edit/delete for scene messages to non-GM non-author', () => {
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u2' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument()
  })

  it('allows replying to a scene message', () => {
    const mockOnReply = vi.fn()
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u2' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={mockOnReply} />)
    fireEvent.click(screen.getByLabelText('Reply'))
    expect(mockOnReply).toHaveBeenCalledWith(msg)
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

  it('wraps long words in regular message content to avoid horizontal scroll', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'A very long url https://example.com/' + 'x'.repeat(200),
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const prose = container.querySelector('.prose')
    expect(prose?.className).toContain('break-words')
  })

  it('wraps long words in scene message content to avoid horizontal scroll', () => {
    const msg: any = {
      id: 's1',
      type: 'scene',
      content: 'A very long url https://example.com/' + 'x'.repeat(200),
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const prose = container.querySelector('.prose')
    expect(prose?.className).toContain('break-words')
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
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20+3', 'm1', undefined, undefined)
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
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20-2', 'm1', undefined, undefined)
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
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1', undefined, undefined)
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
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1', undefined, undefined)
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
    // Warning stays out of the notation (which the parser must accept) and is
    // passed as a separate third argument.
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+3', 'm1', expect.stringContaining('Missing DEX modifier'), undefined)
  })

  it('renders check correctly for Shadowdark with modifier', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: 4 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+4', 'm1', undefined, undefined)
  })

  it('clamps Shadowdark check modifier above 4 to 4', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: 7 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+4', 'm1', undefined, undefined)
  })

  it('clamps Shadowdark check modifier below -4 to -4', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: -6 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20-4', 'm1', undefined, undefined)
  })

  it('passes the called-out DC to onRollDice for DC checks', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('2'))
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: 'Make a DC 12 DEX Check', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { DEX: 2 }}]} />)
    expect(screen.getByText('DEX Check (DC 12)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DEX Check (DC 12)' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+2', 'm1', undefined, 12)
  })

  it('renders a successful check result in green with a Success badge', () => {
    const msg: any = {
      type: 'dice_roll',
      content: 'Rolled 1d20+2: **18**\n\n**Success** (DC 12)',
      sender: { display_name: 'Hero' },
      roll_dc: 12,
      roll_success: true
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const card = container.querySelector('.max-w-lg')
    expect(card?.className).toContain('bg-green-50')
    const badge = container.querySelector('span.bg-green-100')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('Success')
  })

  it('renders a failed check result in red with a Failure badge', () => {
    const msg: any = {
      type: 'dice_roll',
      content: 'Rolled 1d20+2: **10**\n\n**Failure** (DC 12)',
      sender: { display_name: 'Hero' },
      roll_dc: 12,
      roll_success: false
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const card = container.querySelector('.max-w-lg')
    expect(card?.className).toContain('bg-red-50')
    const badge = container.querySelector('span.bg-red-100')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('Failure')
  })

  it('keeps the default indigo styling when no DC was attached', () => {
    const msg: any = {
      type: 'dice_roll',
      content: 'Rolled 1d20+2: **18**',
      sender: { display_name: 'Hero' }
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const card = container.querySelector('.max-w-lg')
    expect(card?.className).toContain('bg-indigo-50')
    expect(container.querySelector('span.bg-green-100, span.bg-red-100')).toBeNull()
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

  it('calls onXCard with the message id when X-Card button clicked on a regular message', () => {
    const mockOnXCard = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onXCard={mockOnXCard} />)
    fireEvent.click(screen.getByLabelText('X-Card'))
    expect(mockOnXCard).toHaveBeenCalledWith('m1')
  })

  it('calls onXCard when X-Card button clicked on a scene message', () => {
    const mockOnXCard = vi.fn()
    const msg: any = {
      id: 's1',
      type: 'scene',
      content: 'You enter a dark tavern',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} onXCard={mockOnXCard} />)
    fireEvent.click(screen.getByLabelText('X-Card'))
    expect(mockOnXCard).toHaveBeenCalledWith('s1')
  })

  it('hides X-Card button when onXCard not provided', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByLabelText('X-Card')).not.toBeInTheDocument()
  })

})
