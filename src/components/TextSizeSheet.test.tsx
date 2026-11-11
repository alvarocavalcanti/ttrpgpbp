import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TextSizeSheet } from './TextSizeSheet'
import { setTextSize } from '../hooks/useTextSize'

describe('TextSizeSheet', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.style.cssText = ''
    act(() => setTextSize(100))
    window.localStorage.clear()
  })

  it('renders the dialog with the current size', () => {
    render(<TextSizeSheet onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Text size' })).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('150%')).toBeInTheDocument()
  })

  it('exposes the slider bounds, step and current value', () => {
    render(<TextSizeSheet onClose={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: 'Text size' })
    expect(slider).toHaveAttribute('min', '75')
    expect(slider).toHaveAttribute('max', '150')
    expect(slider).toHaveAttribute('step', '25')
    expect(slider).toHaveValue('100')
    expect(slider).toHaveAttribute('aria-valuetext', '100%')
  })

  it('applies and persists a new size as the slider moves', () => {
    render(<TextSizeSheet onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Text size' }), { target: { value: '125' } })

    expect(screen.getByText('125%')).toBeInTheDocument()
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.25')
    expect(window.localStorage.getItem('rolebypost-text-size')).toBe('125')
  })

  it('reflects a size that is already set', () => {
    act(() => setTextSize(150))
    render(<TextSizeSheet onClose={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: 'Text size' })
    expect(slider).toHaveValue('150')
    expect(slider).toHaveAttribute('aria-valuetext', '150%')
  })

  it('closes from the close button', () => {
    const onClose = vi.fn()
    render(<TextSizeSheet onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close options'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<TextSizeSheet onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
