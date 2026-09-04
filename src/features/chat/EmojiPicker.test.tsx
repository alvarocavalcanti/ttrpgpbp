import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EmojiPicker } from './EmojiPicker'

describe('EmojiPicker', () => {
  it('opens and picks an emoji', () => {
    const onPick = vi.fn()
    render(<EmojiPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Add reaction'))
    fireEvent.click(screen.getByText('🔥'))
    expect(onPick).toHaveBeenCalledWith('🔥')
  })

  it('closes on outside click', () => {
    const onPick = vi.fn()
    render(
      <div>
        <EmojiPicker onPick={onPick} />
        <button type="button">outside</button>
      </div>
    )
    fireEvent.click(screen.getByLabelText('Add reaction'))
    expect(screen.getByText('👍')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByText('👍')).not.toBeInTheDocument()
  })

  describe('controlled mode', () => {
    it('renders the grid without the trigger button when open', () => {
      const onOpenChange = vi.fn()
      render(<EmojiPicker onPick={vi.fn()} open onOpenChange={onOpenChange} />)
      expect(screen.getByText('👍')).toBeInTheDocument()
      expect(screen.queryByLabelText('Add reaction')).not.toBeInTheDocument()
    })

    it('hides the grid when closed', () => {
      render(<EmojiPicker onPick={vi.fn()} open={false} onOpenChange={vi.fn()} />)
      expect(screen.queryByText('👍')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Add reaction')).not.toBeInTheDocument()
    })

    it('reports outside click via onOpenChange(false)', () => {
      const onOpenChange = vi.fn()
      render(
        <div>
          <EmojiPicker onPick={vi.fn()} open onOpenChange={onOpenChange} />
          <button type="button">outside</button>
        </div>
      )
      fireEvent.mouseDown(screen.getByText('outside'))
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('picks an emoji, fires onPick and closes via onOpenChange(false)', () => {
      const onPick = vi.fn()
      const onOpenChange = vi.fn()
      render(<EmojiPicker onPick={onPick} open onOpenChange={onOpenChange} />)
      fireEvent.click(screen.getByText('🔥'))
      expect(onPick).toHaveBeenCalledWith('🔥')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
