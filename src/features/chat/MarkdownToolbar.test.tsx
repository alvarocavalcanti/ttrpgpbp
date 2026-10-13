import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MarkdownToolbar } from './MarkdownToolbar'

const setViewport = (mobile: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as any
}

describe('MarkdownToolbar', () => {
  afterEach(() => setViewport(false))

  it('renders cheat sheet first, then all format controls on desktop', () => {
    render(<MarkdownToolbar onApply={() => {}} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' })
    const buttons = toolbar.querySelectorAll('button')
    expect(buttons[0].getAttribute('aria-label')).toBe('Markdown cheat sheet')
    expect(buttons.length).toBe(11)
  })

  it('calls onApply once with the expected format', () => {
    const onApply = vi.fn()
    render(<MarkdownToolbar onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith('bold')
  })

  it('opens the cheat sheet and closes it', () => {
    render(<MarkdownToolbar onApply={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Markdown cheat sheet' }))
    expect(screen.getByRole('dialog', { name: 'Markdown cheat sheet' })).toBeInTheDocument()
  })

  it('collapses to cheat, bold and a three-dot menu on narrow screens', () => {
    setViewport(true)
    const onApply = vi.fn()
    render(<MarkdownToolbar onApply={onApply} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' })
    const buttons = toolbar.querySelectorAll('button')
    expect(buttons.length).toBe(3)
    expect(buttons[0].getAttribute('aria-label')).toBe('Markdown cheat sheet')
    expect(buttons[1].getAttribute('aria-label')).toBe('Bold')
    fireEvent.click(screen.getByRole('button', { name: 'More formatting options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Spoiler' }))
    expect(onApply).toHaveBeenCalledWith('spoiler')
  })

  it('applies bold straight from the narrow row', () => {
    setViewport(true)
    const onApply = vi.fn()
    render(<MarkdownToolbar onApply={onApply} />)
    fireEvent.click(screen.getByRole('toolbar', { name: 'Text formatting' }).querySelector('button[aria-label="Bold"]')!)
    expect(onApply).toHaveBeenCalledWith('bold')
  })

  it('renders nothing when hidden', () => {
    const { container } = render(<MarkdownToolbar onApply={() => {}} hidden />)
    expect(container.firstChild).toBeNull()
  })

  it('keeps an open sheet mounted when hidden (focus moved into the sheet)', () => {
    const { rerender } = render(<MarkdownToolbar onApply={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Markdown cheat sheet' }))
    expect(screen.getByRole('dialog', { name: 'Markdown cheat sheet' })).toBeInTheDocument()
    // Simulate the textarea blur that follows focus moving into the sheet.
    rerender(<MarkdownToolbar onApply={() => {}} hidden />)
    expect(screen.getByRole('dialog', { name: 'Markdown cheat sheet' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).not.toBeInTheDocument()
  })

  it('toolbar buttons do not submit a surrounding form', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <MarkdownToolbar onApply={() => {}} />
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
