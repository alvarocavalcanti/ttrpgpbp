import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BottomSheet } from './BottomSheet'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BottomSheet', () => {
  it('renders the title and children', () => {
    render(<BottomSheet title="Options" onClose={vi.fn()}>content</BottomSheet>)
    expect(screen.getByRole('dialog', { name: 'Options' })).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    render(<BottomSheet title="Options" onClose={onClose}>content</BottomSheet>)
    const dialog = screen.getByRole('dialog', { name: 'Options' })
    const backdrop = dialog.firstElementChild as Element
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on the close button', () => {
    const onClose = vi.fn()
    render(<BottomSheet title="Options" onClose={onClose}>content</BottomSheet>)
    fireEvent.click(screen.getByLabelText('Close options'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<BottomSheet title="Options" onClose={onClose}>content</BottomSheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
