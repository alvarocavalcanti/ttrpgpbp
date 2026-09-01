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
    fireEvent.click(screen.getByRole('dialog', { name: 'Delete it?' }).querySelector('[aria-hidden="true"]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    rerender(<ConfirmDialog title="Delete it?" onConfirm={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
