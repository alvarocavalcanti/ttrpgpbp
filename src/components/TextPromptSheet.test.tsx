import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TextPromptSheet } from './TextPromptSheet'

describe('TextPromptSheet', () => {
  it('renders a labelled input prefilled with the initial value', () => {
    render(<TextPromptSheet title="Mark Away (AFK)" label="Away message (optional)" maxLength={200} initialValue="Back on Thursday" confirmLabel="Mark Away" onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Mark Away (AFK)' })).toBeInTheDocument()
    const input = screen.getByLabelText('Away message (optional)')
    expect(input).toHaveValue('Back on Thursday')
    // Literal touch-target requirement (UX audit): the prompt input grows to
    // 44px — asserted literally so a sizing regression fails.
    expect(input.className).toContain('min-h-11')
  })

  it('caps input length at maxLength', () => {
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('Message')).toHaveAttribute('maxLength', '200')
  })

  it('shows a character counter', () => {
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} initialValue="abc" confirmLabel="Save" onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('3/200')).toBeInTheDocument()
  })

  it('confirms with the trimmed value', () => {
    const onConfirm = vi.fn()
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  hello  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith('hello')
  })

  it('confirms on Enter via form submit', () => {
    const onConfirm = vi.fn()
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.submit(screen.getByLabelText('Message').closest('form') as HTMLFormElement)

    expect(onConfirm).toHaveBeenCalledWith('')
  })

  it('cancel closes without confirming', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={onConfirm} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('escape closes without confirming', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={onConfirm} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('sizes the Cancel and confirm buttons to 44px touch targets (CodeRabbit)', () => {
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={vi.fn()} onClose={vi.fn()} />)

    for (const name of ['Cancel', 'Save']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11')
    }
  })

  it('focuses the input on open', () => {
    render(<TextPromptSheet title="Prompt" label="Message" maxLength={200} confirmLabel="Save" onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('Message')).toHaveFocus()
  })
})
