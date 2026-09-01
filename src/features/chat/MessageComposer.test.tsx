import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageComposer } from './MessageComposer'
import { useImageUpload } from '../../hooks/useImageUpload'

const { mockUploadImage } = vi.hoisted(() => ({ mockUploadImage: vi.fn() }))

vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: vi.fn(() => ({
    uploadEnabled: true,
    settingsLoading: false,
    uploading: false,
    uploadImage: mockUploadImage,
  })),
}))

describe('MessageComposer', () => {
  const members: any[] = [
    { id: 'm1', user_id: 'u1', character_name: 'Hero', profile: { display_name: 'P1' } }
  ]

  beforeEach(() => {
    mockUploadImage.mockReset()
    mockUploadImage.mockResolvedValue('https://supabase/images/c1/message/u.jpg')
    localStorage.clear()
    vi.mocked(useImageUpload).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadImage: mockUploadImage,
    })
  })

  afterEach(() => {
    // Restore the default non-matching viewport so the composer renders inline.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as any
  })

  const setMobileViewport = () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as any
  }

  it('restores draft from localStorage on mount and isolates by channel', () => {
    localStorage.setItem('composer_draft_c1', 'draft for c1')
    localStorage.setItem('composer_draft_c2', 'draft for c2')

    const { getByPlaceholderText, unmount } = render(
      <MessageComposer channelId="c1" isGM={false} members={[]} onSendMessage={vi.fn()} />
    )
    const textarea = getByPlaceholderText(/Type a message/i)
    expect(textarea).toHaveValue('draft for c1')

    unmount()
    const { getByPlaceholderText: getByPlaceholderText2 } = render(
      <MessageComposer channelId="c2" isGM={false} members={[]} onSendMessage={vi.fn()} />
    )
    expect(getByPlaceholderText2(/Type a message/i)).toHaveValue('draft for c2')
  })

  it('saves draft to localStorage on change and clears on success', async () => {
    const mockOnSendMessage = vi.fn().mockResolvedValue(undefined)
    const { getByPlaceholderText, getByRole } = render(
      <MessageComposer channelId="c1" isGM={false} members={[]} onSendMessage={mockOnSendMessage} />
    )
    
    const textarea = getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'new draft' } })
    
    expect(localStorage.getItem('composer_draft_c1')).toBe('new draft')
    
    const submitBtn = getByRole('button', { name: /Send/i })
    fireEvent.click(submitBtn)
    
    await waitFor(() => {
      expect(mockOnSendMessage).toHaveBeenCalled()
      expect(localStorage.getItem('composer_draft_c1')).toBeNull()
      expect(textarea).toHaveValue('')
    })
  })

  it('retains draft on failure', async () => {
    const mockOnSendMessage = vi.fn().mockRejectedValue(new Error('Network error'))
    const { getByPlaceholderText, getByRole } = render(
      <MessageComposer channelId="c1" isGM={false} members={[]} onSendMessage={mockOnSendMessage} />
    )
    
    const textarea = getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'failed message' } })
    
    const submitBtn = getByRole('button', { name: /Send/i })
    fireEvent.click(submitBtn)
    
    await waitFor(() => {
      expect(mockOnSendMessage).toHaveBeenCalled()
      expect(localStorage.getItem('composer_draft_c1')).toBe('failed message')
      expect(textarea).toHaveValue('failed message')
    })
  })

  it('submits regular message', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Hello',
        type: 'regular',
        whisper_to: undefined
      })
    })
  })

  it('caps composed messages at 4000 characters', () => {
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} />)
    expect(screen.getByPlaceholderText(/Type a message/i)).toHaveAttribute('maxLength', '4000')
  })

  it('allows GM to send scene', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('Scene Description'))
    fireEvent.change(screen.getByPlaceholderText(/Describe the scene/i), { target: { value: 'A dark cave.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'A dark cave.',
        type: 'scene',
        whisper_to: undefined,
        active_player_ids: undefined
      })
    })
  })

  it('caps NPC names at 40 characters', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    expect(screen.getByLabelText('NPC Name')).toHaveAttribute('maxLength', '40')
  })

  it('allows sending whispers', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    fireEvent.change(screen.getByPlaceholderText(/Type a private whisper/i), { target: { value: 'psst' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'psst',
        type: 'regular',
        whisper_to: 'u1',
        active_player_ids: undefined
      })
    })
  })

  it('handles send error', async () => {
    const mockOnSend = vi.fn().mockRejectedValue(new Error('Send failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    // Wait for the async submit handler to catch the error
    await screen.findByRole('button', { name: 'Send' }) // Re-enables after finally block
    expect(console.error).toHaveBeenCalled()
    expect(screen.getByText('Failed to send message. Please try again.')).toBeInTheDocument()
  })

  it('sends message via cmd+enter', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Cmd Enter' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Cmd Enter',
        type: 'regular',
        whisper_to: undefined
      })
    })
  })

  it('does not send empty message', () => {
    const mockOnSend = vi.fn()
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(mockOnSend).not.toHaveBeenCalled()
  })

  it('does not transform raw image URLs to markdown', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)

    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Check this: https://example.com/image.png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Check this: https://example.com/image.png',
        type: 'regular',
        whisper_to: undefined,
        active_player_ids: undefined
      })
    })
  })

  it('hides the load image urls toggle from the GM options', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.queryByLabelText('Load Image URLs')).not.toBeInTheDocument()
  })

  it('sends reply_to and clears reply on cancel', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    const mockOnCancelReply = vi.fn()
    const replyTo = { id: 'm1', content: 'original message', senderName: 'Hero' }
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} replyTo={replyTo} onCancelReply={mockOnCancelReply} />)
    
    expect(screen.getByText(/Replying to Hero/)).toBeInTheDocument()
    
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'my reply' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'my reply',
        type: 'regular',
        whisper_to: undefined,
        reply_to: 'm1'
      })
    })
    expect(mockOnCancelReply).toHaveBeenCalled()
  })

  it('cancels reply via the cancel button', () => {
    const mockOnCancelReply = vi.fn()
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} replyTo={{ id: 'm1', content: 'x', senderName: 'Hero' }} onCancelReply={mockOnCancelReply} />)
    fireEvent.click(screen.getByLabelText('Cancel reply'))
    expect(mockOnCancelReply).toHaveBeenCalled()
  })

  it('linkifies mentions into chips', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hi @Hero!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Hi [@Hero](user:u1)!',
        type: 'regular',
        whisper_to: undefined
      })
    })
  })

  it('passes replyTo.id when rolling dice during a reply', () => {
    const mockOnRoll = vi.fn()
    render(
      <MessageComposer
        isGM={false}
        members={members}
        onSendMessage={vi.fn()}
        onRollDice={mockOnRoll}
        replyTo={{ id: 'm1', content: 'x', senderName: 'Hero' }}
        onCancelReply={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll Dice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20', 'm1')
  })

  it('rolls dice without replyTo when not replying', () => {
    const mockOnRoll = vi.fn()
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} onRollDice={mockOnRoll} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll Dice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')
  })

  it('shows mention autocomplete and inserts selected mention', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hi @He', selectionStart: 5 } })
    
    expect(screen.getByText('Hero')).toBeInTheDocument()
    
    fireEvent.mouseDown(screen.getByRole('option', { name: /Hero/ }))
    
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toContain('@Hero ')
    })
  })

  it('highlights the first mention option by default', () => {
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hi @H', selectionStart: 5 } })

    expect(screen.getByRole('option', { name: /Hero/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('moves the highlight with arrow keys and inserts the highlighted option on Enter', async () => {
    const multiMembers: any[] = [
      { id: 'm1', user_id: 'u1', character_name: 'Hero', profile: { display_name: 'P1' } },
      { id: 'm2', user_id: 'u2', character_name: 'Archer', profile: { display_name: 'P2' } },
    ]
    render(<MessageComposer isGM={false} members={multiMembers} onSendMessage={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hi @', selectionStart: 5 } })

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Archer/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Hero/ })).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('Hi @Archer ')
    })
  })

  it('wraps the highlight around with ArrowUp', () => {
    const multiMembers: any[] = [
      { id: 'm1', user_id: 'u1', character_name: 'Hero', profile: { display_name: 'P1' } },
      { id: 'm2', user_id: 'u2', character_name: 'Archer', profile: { display_name: 'P2' } },
    ]
    render(<MessageComposer isGM={false} members={multiMembers} onSendMessage={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hi @', selectionStart: 5 } })

    fireEvent.keyDown(textarea, { key: 'ArrowUp' })
    expect(screen.getByRole('option', { name: /Archer/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates @all as the first option for the GM', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hi @', selectionStart: 5 } })

    expect(screen.getByRole('option', { name: /All players/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Hero/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('linkifies @all to every member for the GM', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)

    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Everyone @all!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Everyone [@all](user:all)!',
        type: 'regular',
        whisper_to: undefined,
        active_player_ids: undefined
      })
    })
  })

  it('does not linkify @all for non-GM players', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)

    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Everyone @all!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Everyone @all!',
        type: 'regular',
        whisper_to: undefined
      })
    })
  })

  it('shows the @all autocomplete option for the GM and inserts it', async () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hi @a', selectionStart: 5 } })

    expect(screen.getByRole('option', { name: /All players/ })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('option', { name: /All players/ }))

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('Hi @all ')
    })
  })

  it('hides the @all autocomplete option for non-GM players', () => {
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hi @a', selectionStart: 5 } })

    expect(screen.queryByRole('option', { name: /All players/ })).not.toBeInTheDocument()
  })

  it('hides NPC mode from players', () => {
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.queryByLabelText('NPC Mode')).not.toBeInTheDocument()
  })

  it('sends an NPC message with a generated portrait', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    fireEvent.change(screen.getByLabelText('NPC Name'), { target: { value: 'Goblin King' } })

    const preview = container.querySelector('img[class*="dark:invert"]')
    expect(preview).not.toBeNull()
    expect(preview?.getAttribute('src')).toMatch(/^https:\/\/api\.iconify\.design\/game-icons\//)

    fireEvent.change(screen.getByPlaceholderText(/Speak as Goblin King/i), { target: { value: 'Trespassers!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'Trespassers!',
        type: 'npc',
        whisper_to: undefined,
        active_player_ids: undefined,
        npc_name: 'Goblin King',
        npc_avatar_url: expect.stringMatching(/^https:\/\/api\.iconify\.design\/game-icons\/.+\.svg$/)
      })
    })
  })

  it('reuses the existing NPC avatar when the name matches the roster', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    const npcs = [{ id: 'n1', channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://example.com/king.png', created_at: '' }]
    const { container } = render(<MessageComposer isGM={true} members={members} npcs={npcs} onSendMessage={mockOnSend} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    fireEvent.change(screen.getByLabelText('NPC Name'), { target: { value: 'goblin king' } })
    fireEvent.change(screen.getByPlaceholderText(/Speak as goblin king/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith(expect.objectContaining({
        type: 'npc',
        npc_name: 'goblin king',
        npc_avatar_url: 'https://example.com/king.png'
      }))
    })
    expect(container.querySelector('img[class*="dark:invert"]')).toBeNull()
  })

  it('omits npc_avatar_url when the matched roster NPC has no avatar', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    const npcs = [{ id: 'n1', channel_id: 'c1', name: 'Faceless', avatar_url: null, created_at: '' }] as any
    render(<MessageComposer isGM={true} members={members} npcs={npcs} onSendMessage={mockOnSend} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    fireEvent.change(screen.getByLabelText('NPC Name'), { target: { value: 'Faceless' } })
    // Pick from the roster dropdown: this sets npcAvatarUrl to the roster's
    // null avatar_url, so resolvedNpcAvatar stays null and the payload omits it.
    fireEvent.mouseDown(screen.getByRole('button', { name: /Faceless/i }))
    fireEvent.change(screen.getByPlaceholderText(/Speak as Faceless/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith(expect.objectContaining({
        type: 'npc',
        npc_name: 'Faceless',
        npc_avatar_url: undefined
      }))
    })
  })

  it('blocks NPC send without a name', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    fireEvent.change(screen.getByPlaceholderText(/Speak as an NPC/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText('Enter an NPC name to speak as.')).toBeInTheDocument()
      expect(mockOnSend).not.toHaveBeenCalled()
    })
  })

  it('NPC and Scene modes are mutually exclusive', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))

    fireEvent.click(screen.getByLabelText('NPC Mode'))
    expect(screen.getByLabelText('NPC Mode')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByLabelText('Scene Description'))
    expect(screen.getByLabelText('Scene Description')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('NPC Mode')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onXCard when X-Card button clicked in the expanded options', () => {
    const mockOnXCard = vi.fn()
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} onXCard={mockOnXCard} />)
    expect(screen.queryByLabelText('X-Card')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('X-Card'))
    expect(mockOnXCard).toHaveBeenCalled()
  })

  it('hides X-Card button when onXCard not provided', () => {
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.queryByLabelText('X-Card')).not.toBeInTheDocument()
  })

  it('hides the upload button from players', () => {
    render(<MessageComposer isGM={false} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.queryByLabelText('Upload Image')).not.toBeInTheDocument()
  })

  it('renders all composer chips with uniform dimensions', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} onXCard={vi.fn()} onRollDice={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))

    const chips = [
      screen.getByRole('button', { name: 'Roll Dice' }),
      screen.getByLabelText('X-Card'),
      screen.getByLabelText('Upload Image').closest('label'),
      screen.getByLabelText('Scene Description'),
      screen.getByLabelText('NPC Mode'),
    ]

    for (const chip of chips) {
      expect(chip).not.toBeNull()
      expect(chip).toHaveClass('px-3', 'py-2', 'text-sm', 'font-medium', 'rounded-lg', 'border')
    }
  })

  it('uploads an image and inserts the markdown at the cursor', async () => {
    render(<MessageComposer channelId="c1" isGM={true} members={members} onSendMessage={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hi ' } })
    fireEvent.change(screen.getByLabelText('Upload Image'), {
      target: { files: [new File(['data'], 'map.png', { type: 'image/png' })] },
    })

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledWith(expect.any(File), 'message', 1200)
      expect(textarea).toHaveValue('Hi ![](https://supabase/images/c1/message/u.jpg)\n')
    })
  })

  it('shows the upload error when the image upload fails', async () => {
    mockUploadImage.mockRejectedValue(new Error('Image uploads are disabled by the server admin'))
    render(<MessageComposer channelId="c1" isGM={true} members={members} onSendMessage={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.change(screen.getByLabelText('Upload Image'), {
      target: { files: [new File(['data'], 'map.png', { type: 'image/png' })] },
    })

    expect(await screen.findByText('Image uploads are disabled by the server admin')).toBeInTheDocument()
  })

  it('disables the upload button while uploads are disabled by the admin', () => {
    vi.mocked(useImageUpload).mockReturnValue({
      uploadEnabled: false,
      settingsLoading: false,
      uploading: false,
      uploadImage: mockUploadImage,
    })
    render(<MessageComposer channelId="c1" isGM={true} members={members} onSendMessage={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.getByLabelText('Upload Image')).toBeDisabled()
  })

  it('uploads an NPC portrait image and previews it', async () => {
    mockUploadImage.mockResolvedValue('https://supabase/images/c1/npc/u.jpg')
    render(<MessageComposer channelId="c1" isGM={true} members={members} onSendMessage={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    fireEvent.change(screen.getByLabelText('Upload NPC portrait'), {
      target: { files: [new File(['data'], 'king.png', { type: 'image/png' })] },
    })

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledWith(expect.any(File), 'npc')
    })
    expect(await screen.findByAltText('NPC portrait preview')).toHaveAttribute('src', 'https://supabase/images/c1/npc/u.jpg')
  })

  it('applies dark-mode backgrounds to the composer inputs', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))

    const messageInput = screen.getByPlaceholderText(/Type a message/i)
    expect(messageInput).toHaveClass('dark:bg-gray-800')
    expect(messageInput).toHaveClass('text-gray-900')
    expect(messageInput).toHaveClass('dark:text-gray-100')
    expect(screen.getByRole('button', { name: /Whisper/ })).toHaveClass('dark:bg-gray-800')

    fireEvent.click(screen.getByLabelText('NPC Mode'))
    expect(screen.getByPlaceholderText(/Speak as an NPC/i)).toHaveClass('dark:bg-parchment-dark')
  })

  it('keeps the typed message text visible on dark backgrounds', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('NPC Mode'))
    fireEvent.click(screen.getByLabelText('NPC Name'))
    fireEvent.change(screen.getByLabelText('NPC Name'), { target: { value: 'Goblin King' } })

    expect(screen.getByPlaceholderText(/Speak as Goblin King/i)).toHaveClass('dark:text-gray-100')
    expect(screen.getByLabelText('NPC Name')).toHaveClass('text-gray-900')
    expect(screen.getByLabelText('NPC Name')).toHaveClass('dark:text-gray-100')
  })

  it('renders options inline (not in a sheet) on desktop', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Scene Description')).toBeInTheDocument()
  })

  it('renders options in a bottom sheet on mobile', () => {
    setMobileViewport()
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.getByRole('dialog', { name: 'Options' })).toBeInTheDocument()
  })

  it('shows text labels on option chips on mobile (no icon-only controls)', () => {
    setMobileViewport()
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} onXCard={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.getByRole('button', { name: 'Scene Description' })).toHaveTextContent('Scene')
    expect(screen.getByRole('button', { name: 'NPC Mode' })).toHaveTextContent('NPC')
    expect(screen.getByText('X Card')).toBeInTheDocument()
  })

  it('opens whisper and active player as dialog popups on mobile', () => {
    setMobileViewport()
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(screen.getByRole('dialog', { name: 'Whisper' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Hero/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.click(screen.getByRole('button', { name: /Active Player/ }))
    expect(screen.getByRole('dialog', { name: 'Active Player' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Hero/ })).toBeInTheDocument()
  })

  it('selects a whisper target via the menu on mobile', async () => {
    setMobileViewport()
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    fireEvent.change(screen.getByPlaceholderText(/Type a private whisper/i), { target: { value: 'psst' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith({
        content: 'psst',
        type: 'regular',
        whisper_to: 'u1',
        active_player_ids: undefined
      })
    })
  })

  it('sets the active player via its menu', async () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)

    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: /Active Player/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Go!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith(expect.objectContaining({
        content: 'Go!',
        type: 'regular',
        active_player_ids: ['u1']
      }))
    })
  })

  it('closes the bottom sheet on Escape', () => {
    setMobileViewport()
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.getByRole('dialog', { name: 'Options' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders no indicator chips when no options are active', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    expect(screen.queryByLabelText(/^Edit /)).not.toBeInTheDocument()
  })

  it('shows an indicator chip for an active scene when the panel is closed', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('Scene Description'))
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.getByLabelText('Edit Scene')).toBeInTheDocument()
    expect(screen.queryByLabelText('Edit NPC')).not.toBeInTheDocument()
  })

  it('clicking an indicator chip reopens the options panel', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('Scene Description'))
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByLabelText('Edit Scene'))
    expect(screen.getByLabelText('Scene Description')).toBeInTheDocument()
  })

  it('shows whisper and active player indicator chips with member names', () => {
    render(<MessageComposer isGM={true} members={members} onSendMessage={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Toggle options'))
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    fireEvent.click(screen.getByRole('button', { name: /Active Player/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    fireEvent.click(screen.getByLabelText('Toggle options'))
    expect(screen.getByLabelText('Edit Whisper: Hero')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit Active: Hero')).toBeInTheDocument()
  })
})

it('folds the keyboard shortcut into the send button title and drops the floating tip', () => {
  const { getByRole, queryByText } = render(
    <MessageComposer channelId="c1" isGM={false} members={[]} onSendMessage={vi.fn()} />
  )
  const send = getByRole('button', { name: /Send/i })
  expect(send).toHaveAttribute('title', expect.stringMatching(/Enter/))
  // 44px touch target bump
  expect(send).toHaveClass('p-3')
  expect(queryByText(/to send/i)).not.toBeInTheDocument()
})
