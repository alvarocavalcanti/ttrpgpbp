import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MessageComposer } from './MessageComposer'

describe('MessageComposer', () => {
  const members: any[] = [
    { id: 'm1', user_id: 'u1', character_name: 'Hero', profile: { display_name: 'P1' } }
  ]

  it('submits regular message', () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(mockOnSend).toHaveBeenCalledWith({
      content: 'Hello',
      type: 'regular',
      whisper_to: undefined
    })
  })

  it('allows GM to send scene', () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={true} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.click(screen.getByLabelText('Scene Description'))
    fireEvent.change(screen.getByPlaceholderText(/Describe the scene/i), { target: { value: 'A dark cave.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(mockOnSend).toHaveBeenCalledWith({
      content: 'A dark cave.',
      type: 'scene',
      whisper_to: undefined
    })
  })

  it('allows sending whispers', () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.change(screen.getByLabelText('Whisper:'), { target: { value: 'u1' } })
    fireEvent.change(screen.getByPlaceholderText(/Type a private whisper/i), { target: { value: 'psst' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(mockOnSend).toHaveBeenCalledWith({
      content: 'psst',
      type: 'regular',
      whisper_to: 'u1'
    })
  })

  it('handles send error', async () => {
    const mockOnSend = vi.fn().mockRejectedValue(new Error('Send failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    
    // Wait for the async submit handler to catch the error
    await screen.findByText('Send') // Re-enables after finally block
    expect(console.error).toHaveBeenCalled()
  })

  it('sends message via cmd+enter', () => {
    const mockOnSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer isGM={false} members={members} onSendMessage={mockOnSend} />)
    
    const textarea = screen.getByPlaceholderText(/Type a message/i)
    fireEvent.change(textarea, { target: { value: 'Cmd Enter' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    
    expect(mockOnSend).toHaveBeenCalledWith({
      content: 'Cmd Enter',
      type: 'regular',
      whisper_to: undefined
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
})
