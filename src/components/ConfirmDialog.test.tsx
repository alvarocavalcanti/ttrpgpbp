import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders title, description and confirm label', () => {
    render(<ConfirmDialog title="Delete it?" description="Gone forever." confirmLabel="Yes" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Delete it?' })).toBeInTheDocument()
    expect(screen.getByText('Gone forever.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('defaults the confirm label to Delete', () => {
    render(<ConfirmDialog title="Delete it?" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('runs onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="Delete it?" onConfirm={onConfirm} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('closes via Cancel without confirming', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDialog title="Delete it?" onConfirm={onConfirm} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes via backdrop tap and via Escape', () => {
    const onClose = vi.fn()
    const { rerender } = render(<ConfirmDialog title="Delete it?" onConfirm={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('confirm-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    rerender(<ConfirmDialog title="Delete it?" onConfirm={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('focuses the Cancel button on open (safe choice for destructive actions)', () => {
    render(<ConfirmDialog title="Delete it?" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('traps Tab focus inside the dialog', () => {
    render(<ConfirmDialog title="Delete it?" onConfirm={vi.fn()} onClose={vi.fn()} />)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Delete' })

    // Focus starts on Cancel; Shift+Tab wraps to the last focusable (confirm).
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)

    // Tab from the last focusable wraps back to the first (cancel).
    fireEvent.keyDown(confirm, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(cancel)
  })
})
