import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelStatusBar } from './ChannelStatusBar'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('ChannelStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders null if no status and not GM', () => {
    const { container } = render(<ChannelStatusBar channelId="c1" statusText={null} activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders "No status set" if GM and no status', () => {
    render(<ChannelStatusBar channelId="c1" statusText={null} activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)
    expect(screen.getByText('No status set.')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('renders active players when provided', () => {
    render(<ChannelStatusBar channelId="c1" statusText={null} activePlayers={[{ character_name: 'Thor', user_id: 'u1' }]} isGM={false} onUpdate={vi.fn()} />)
    expect(screen.getByText('Active:')).toBeInTheDocument()
    expect(screen.getByText('Thor')).toBeInTheDocument()
  })

  it('renders markdown status text and toggles expansion', () => {
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="**Bold** status" activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    
    const toggleButton = container.querySelector('button[title="Expand Status"]')!
    expect(toggleButton).toBeInTheDocument()
    
    // Initially line-clamp-1
    expect(container.querySelector('.line-clamp-1')).toBeInTheDocument()

    // Expand
    fireEvent.click(toggleButton)
    expect(container.querySelector('.line-clamp-1')).not.toBeInTheDocument()
  })

  it('applies dark-mode prose variants to the status markdown', () => {
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="**Bold** status" activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    const prose = container.querySelector('.prose')!
    expect(prose).toHaveClass('text-amber-900', 'dark:text-amber-200')
    expect(prose).toHaveClass('dark:prose-p:text-amber-200')
    expect(prose).toHaveClass('dark:prose-strong:text-amber-200')
    expect(prose).not.toHaveClass('prose-amber')
  })

  it('allows GM to edit status', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={mockOnUpdate} />)

    fireEvent.click(screen.getByText('Edit'))
    
    const textarea = screen.getByDisplayValue('Old status')
    fireEvent.change(textarea, { target: { value: 'New status' } })
    
    fireEvent.click(screen.getByText('Save Status'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ status_text: 'New status' })
      expect(mockEq).toHaveBeenCalledWith('id', 'c1')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('cancels edit', () => {
    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Cancel'))
    
    expect(screen.queryByText('Save Status')).not.toBeInTheDocument()
    expect(screen.getByText('Old status')).toBeInTheDocument()
  })

  it('handles save error gracefully', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Save Status'))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(screen.getByText('Failed to save status.')).toBeInTheDocument()
    })
  })
})
