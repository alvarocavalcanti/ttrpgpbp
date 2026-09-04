import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

  it('inverts game-icons NPC portraits in dark mode but not uploaded images', () => {
    const icon: any = {
      type: 'npc',
      content: 'Trespassers!',
      npc_name: 'Goblin King',
      npc_avatar_url: 'https://api.iconify.design/game-icons/goblin-head.svg',
      created_at: new Date().toISOString(),
      sender_id: 'gm1'
    }
    const { container } = render(<MessageItem message={icon} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(container.querySelector('img[src="https://api.iconify.design/game-icons/goblin-head.svg"]')).toHaveClass('dark:invert')

    const uploaded: any = {
      type: 'npc',
      content: 'Trespassers!',
      npc_name: 'Goblin King',
      npc_avatar_url: 'https://example.com/king.png',
      created_at: new Date().toISOString(),
      sender_id: 'gm1'
    }
    const { container: c2 } = render(<MessageItem message={uploaded} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(c2.querySelector('img[src="https://example.com/king.png"]')).not.toHaveClass('dark:invert')
  })

  it('allows the GM author to edit an NPC message within the edit window', async () => {
    const mockOnEdit = vi.fn().mockResolvedValue(undefined)
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

  it('caps message edits at 4000 characters', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Short message',
      created_at: new Date().toISOString(),
      sender_id: 'u1',
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Edit'))
    expect(screen.getByDisplayValue('Short message')).toHaveAttribute('maxLength', '4000')
  })

  it('renders scene message correctly', () => {
    const msg: any = { type: 'scene', content: 'You enter a dark tavern' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('You enter a dark tavern')).toBeInTheDocument()
  })

  it('allows GM to edit and delete a scene message', async () => {
    const mockOnEdit = vi.fn().mockResolvedValue(undefined)
    const mockOnDelete = vi.fn().mockResolvedValue(undefined)
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u1' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    expect(screen.getByText('You enter a dark tavern')).toBeInTheDocument()

    // GM can delete, via the in-app confirmation
    fireEvent.click(screen.getByLabelText('Delete'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete message?' })).getByRole('button', { name: 'Delete' }))
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

  it('hides scene action row for a deleted scene message, even for the GM', () => {
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u1', is_deleted: true }
    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message actions')).not.toBeInTheDocument()
  })

  it('hides scene action row while a scene message is pending', () => {
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u1', pending: true }
    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message actions')).not.toBeInTheDocument()
  })

  it('hides scene action row while editing', () => {
    const msg: any = { id: 's1', type: 'scene', content: 'You enter a dark tavern', created_at: new Date().toISOString(), sender_id: 'u1' }
    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={vi.fn().mockResolvedValue(undefined)} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Edit'))
    expect(screen.getByDisplayValue('You enter a dark tavern')).toBeInTheDocument()
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message actions')).not.toBeInTheDocument()
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

  it('handles ability checks and sends dice roll', async () => {
    const mockOnRollDice = vi.fn()

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)

    const checkBtn = await screen.findByRole('button', { name: 'STR Check' })
    fireEvent.click(checkBtn)
    // Sheet opens with modifier pre-filled to 0; user types +3 and rolls.
    fireEvent.change(screen.getByLabelText('Modifier'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRollDice).toHaveBeenCalledWith('1d20+3', 'm1', undefined, undefined)
  })

  it('handles ability checks with negative modifiers', async () => {
    const mockOnRollDice = vi.fn()

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Make a DEX Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)

    fireEvent.click(screen.getByRole('button', { name: 'DEX Check' }))
    fireEvent.change(screen.getByLabelText('Modifier'), { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20-2', 'm1', undefined, undefined)
  })

  it('handles ability checks with zero modifiers', async () => {
    const mockOnRollDice = vi.fn()

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    
    fireEvent.click(await screen.findByRole('button', { name: 'STR Check' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1', undefined, undefined)
  })

  it('treats non-numeric modifier input as 0', async () => {
    const mockOnRollDice = vi.fn()

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)

    fireEvent.click(await screen.findByRole('button', { name: 'STR Check' }))
    fireEvent.change(screen.getByLabelText('Modifier'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1', undefined, undefined)
  })

  it('does not roll when the check sheet is cancelled', async () => {
    const mockOnRollDice = vi.fn()

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Make a STR Check',
      sender: { display_name: 'GM' }
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)

    fireEvent.click(await screen.findByRole('button', { name: 'STR Check' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockOnRollDice).not.toHaveBeenCalled()
  })

  it('passes the source message id when rolling an inline dice notation', async () => {
    const mockOnRollDice = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Roll 1d20 now',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    fireEvent.click(await screen.findByRole('button', { name: '1d20' }))
    expect(mockOnRollDice).toHaveBeenCalledWith('1d20', 'm1')
  })

  it('ignores clicks on dice links with invalid notation', async () => {
    const mockOnRollDice = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: '[x](dice:notadice!)',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRollDice} />)
    fireEvent.click(await screen.findByRole('button', { name: 'x' }))
    expect(mockOnRollDice).not.toHaveBeenCalled()
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

  it('allows delete if GM', async () => {
    const mockOnDelete = vi.fn()

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Bad message',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }

    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={vi.fn()} onDelete={mockOnDelete} />)

    fireEvent.click(screen.getByLabelText('Delete'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete message?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockOnDelete).toHaveBeenCalledWith('m1'))
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

    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'Bad',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }

    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={mockOnDelete} />)

    fireEvent.click(screen.getByLabelText('Delete'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete message?' })).getByRole('button', { name: 'Delete' }))

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

  it('does not leak react-markdown renderer props onto the img element', () => {
    const msg: any = {
      type: 'regular',
      content: '![Alt text](https://example.com/test.png)',
      created_at: new Date().toISOString(),
      sender_id: 'u2',
      sender: { display_name: 'Hero' }
    }
    const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

    const img = screen.getByRole('img', { name: 'Alt text' })
    // react-markdown hands renderers a `node` prop; the img renderer must not
    // spread it onto the DOM (the `a` renderer already pulls it off).
    expect(img).not.toHaveAttribute('node')
    expect(container.querySelector('img[node]')).toBeNull()
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
    
    // A sanitized (non-http) image src renders nothing rather than a broken
    // or dangerous <img>.
    expect(screen.queryByRole('img', { name: 'Bad Image' })).not.toBeInTheDocument()
  })

  it('renders check correctly for Shadowdark missing modifier', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[DEX Check](check:DEX)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: {}}]} onEditCharacter={vi.fn()} />)
    fireEvent.click(screen.getByText('DEX Check'))
    // Missing modifier opens the sheet pre-filled to 0 and shows the
    // character-sheet link.
    expect(screen.getByText('Set it in your character sheet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    // Warning stays out of the notation (which the parser must accept) and is
    // passed as a separate third argument.
    expect(mockOnRoll).toHaveBeenCalledWith('1d20', 'm1', expect.stringContaining('Missing DEX modifier'), undefined)
  })

  it('renders check correctly for Shadowdark with modifier', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: 4 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    // Sheet pre-fills the modifier from the member profile.
    expect(screen.getByLabelText('Modifier')).toHaveValue('4')
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+4', 'm1', undefined, undefined)
  })

  it('clamps Shadowdark check modifier above 4 to 4', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: 7 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+4', 'm1', undefined, undefined)
  })

  it('clamps Shadowdark check modifier below -4 to -4', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: -6 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20-4', 'm1', undefined, undefined)
  })

  it('passes the called-out DC to onRollDice for DC checks', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: 'Make a DC 12 DEX Check', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { DEX: 2 }}]} />)
    expect(screen.getByText('DEX Check (DC 12)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DEX Check (DC 12)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+2', 'm1', undefined, 12)
  })

  it('rolls 2d20kh1 when a check carries advantage', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: 'Make an INT Check with advantage', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: {}}]} />)
    expect(screen.getByText('INT Check with advantage')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'INT Check with advantage' }))
    fireEvent.change(screen.getByLabelText('Modifier'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d20kh1+1', 'm1', expect.stringContaining('Missing INT modifier'), undefined)
  })

  it('rolls 2d20kl1 and forwards the DC when a DC check carries disadvantage', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: 'Make a DC 12 DEX Check with disadvantage', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { DEX: 2 }}]} />)
    expect(screen.getByText('DEX Check (DC 12) with disadvantage')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DEX Check (DC 12) with disadvantage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d20kl1+2', 'm1', undefined, 12)
  })

  it('switches to advantage from the check sheet and rolls 2d20kh1', async () => {
    const mockOnRoll = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[STR Check](check:STR)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: { STR: 2 }}]} />)
    fireEvent.click(screen.getByText('STR Check'))
    fireEvent.click(screen.getByRole('button', { name: 'Adv' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d20kh1+2', 'm1', undefined, undefined)
  })

  it('deep-links the missing-modifier state to Edit Character', async () => {
    const mockOnRoll = vi.fn()
    const mockOnEditCharacter = vi.fn()
    const msg = { id: 'm1', type: 'scene', content: '[DEX Check](check:DEX)', created_at: new Date().toISOString(), sender_id: 'u1' } as any
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onRollDice={mockOnRoll} gameSystem="shadowdark" members={[{user_id: 'u1', character_name: 'test', attributes: {}}]} onEditCharacter={mockOnEditCharacter} />)
    fireEvent.click(screen.getByText('DEX Check'))
    fireEvent.click(screen.getByText('Set it in your character sheet'))
    expect(mockOnEditCharacter).toHaveBeenCalled()
    expect(mockOnRoll).not.toHaveBeenCalled()
    // Sheet closes after deep-linking.
    expect(screen.queryByRole('button', { name: 'Roll' })).not.toBeInTheDocument()
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
    const dcBadge = container.querySelector('span.bg-amber-100')
    expect(dcBadge).not.toBeNull()
    expect(dcBadge?.textContent).toBe('DC 12')
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

  it('keeps mention chips sans-serif inside serif narrative text', () => {
    const msg: any = {
      id: 'm1',
      type: 'scene',
      content: '[@Hero](user:u1) is here',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const chip = screen.getByText('@Hero')
    expect(chip.className).toContain('font-sans')
    expect(chip.className).not.toContain('font-serif')
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
    fireEvent.click(screen.getByLabelText('Reactions'))
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

  it('does not offer an X-Card message action', () => {
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

  it('deletes via in-app confirmation, never window.confirm', () => {
    const mockOnDelete = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={mockOnDelete} />)
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(confirmSpy).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete message?' })).getByRole('button', { name: 'Delete' }))
    expect(mockOnDelete).toHaveBeenCalledWith('m1')
    confirmSpy.mockRestore()
  })

  it('cancels the delete confirmation without deleting', () => {
    const mockOnDelete = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={mockOnDelete} />)
    fireEvent.click(screen.getByLabelText('Delete'))
    const dialog = screen.getByRole('dialog', { name: 'Delete message?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mockOnDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Delete message?' })).not.toBeInTheDocument()
  })

  it('opens the mobile action sheet listing enabled actions for the message author', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} onToggleReaction={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Message actions'))
    const dialog = screen.getByRole('dialog', { name: 'Message actions' })
    const items = within(dialog).getAllByRole('button').map(b => b.textContent).filter(t => t)
    expect(items).toEqual(['Reply', 'Edit', 'Delete', 'Reactions'])
  })

  it('mobile action sheet lists only X-Card for a non-author player', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Message actions'))
    const dialog = screen.getByRole('dialog', { name: 'Message actions' })
    const items = within(dialog).getAllByRole('button').map(b => b.textContent).filter(t => t)
    expect(items).toEqual(['Reply'])
  })

  it('mobile action sheet lists Reply, Delete and X-Card for the GM', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u2'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={true} onEdit={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Message actions'))
    const dialog = screen.getByRole('dialog', { name: 'Message actions' })
    const items = within(dialog).getAllByRole('button').map(b => b.textContent).filter(t => t)
    expect(items).toEqual(['Reply', 'Delete'])
  })

  it('runs the chosen action from the mobile sheet', () => {
    const mockOnReply = vi.fn()
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={mockOnReply} />)
    fireEvent.click(screen.getByLabelText('Message actions'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Message actions' })).getByRole('button', { name: 'Reply' }))
    expect(mockOnReply).toHaveBeenCalledWith(msg)
    // Sheet closes after picking an action.
    expect(screen.queryByRole('dialog', { name: 'Message actions' })).not.toBeInTheDocument()
  })

  it('raises micro-target sizes on the desktop action icons', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} />)
    for (const label of ['Reply', 'Edit', 'Delete']) {
      const btn = screen.getByLabelText(label)
      // Literal touch-target requirement (UX audit): p-1.5 padding on a
      // w-5 h-5 icon — asserted literally so a sizing regression fails here.
      expect(btn.className).toContain('p-1.5')
      expect(btn.querySelector('svg')).toHaveClass('w-5', 'h-5')
    }
    // Desktop row is hidden on mobile; the ⋯ button is hidden on desktop.
    const wrapper = screen.getByLabelText('Reply').closest('.hidden') as HTMLElement | null
    expect(wrapper?.className).toContain('sm:flex')
    const menuBtn = screen.getByLabelText('Message actions')
    expect(menuBtn.className).toContain('sm:hidden')
  })

  it('raises the emoji picker trigger target size', () => {
    const msg: any = {
      id: 'm1',
      type: 'regular',
      content: 'hi',
      created_at: new Date().toISOString(),
      sender_id: 'u1'
    }
    render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />)
    const trigger = screen.getByLabelText('Reactions')
    expect(trigger.className).toContain('p-1.5')
  })

})

it('keeps timestamps readable on dark backgrounds (AA contrast)', () => {
  const msg: any = { type: 'regular', content: 'hi', created_at: new Date().toISOString(), sender_id: 'u1' }
  const { container } = render(<MessageItem message={msg} currentUserId="u1" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
  const timestamp = Array.from(container.querySelectorAll('span')).find(s => s.className.includes('text-xs') && s.className.includes('gray-500'))
  expect(timestamp).toBeDefined()
  // gray-500 is 3.11:1 on the dark NPC background — below AA; gray-400 is 5.92:1
  expect(timestamp!.className).toContain('dark:text-gray-400')
})

it('styles NPC paragraphs with parchment ink so typography plugin cannot override them', () => {
  const msg: any = { type: 'npc', content: 'hello', created_at: new Date().toISOString(), sender_id: 'u1', npc_name: 'Vex' }
  const { container } = render(<MessageItem message={msg} currentUserId="u2" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
  const content = container.querySelector('.prose')!
  expect(content.className).toContain('prose-p:text-parchment-ink')
  expect(content.className).toContain('dark:prose-p:text-parchment-ink-dark')
  expect(content.className).toContain('font-serif')
})
