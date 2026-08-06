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
        <button>outside</button>
      </div>
    )
    fireEvent.click(screen.getByLabelText('Add reaction'))
    expect(screen.getByText('👍')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByText('👍')).not.toBeInTheDocument()
  })
})
