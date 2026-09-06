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

  it('closes on Escape (uncontrolled)', () => {
    const onPick = vi.fn()
    render(<EmojiPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Add reaction'))
    expect(screen.getByText('👍')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('👍')).not.toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
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

    it('closes on Escape via a single onOpenChange(false)', () => {
      const onOpenChange = vi.fn()
      render(<EmojiPicker onPick={vi.fn()} open onOpenChange={onOpenChange} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onOpenChange).toHaveBeenCalledTimes(1)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('sizes grid cells to the 44px touch target', () => {
      render(<EmojiPicker onPick={vi.fn()} open onOpenChange={vi.fn()} />)
      for (const cell of [screen.getByText('👍').closest('button'), screen.getByText('🎲').closest('button')]) {
        // Literal touch-target requirement (UX-1): 44px tall cells, asserted
        // literally so a sizing regression fails here.
        expect(cell).toHaveClass('h-11')
      }
    })
  })
})
