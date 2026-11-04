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

  it('is one Tab stop and moves between buttons with the arrow keys', () => {
    render(<MarkdownToolbar onApply={() => {}} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' })
    const buttons = Array.from(toolbar.querySelectorAll('button'))
    expect(buttons.map(b => b.tabIndex)).toEqual([0, ...buttons.slice(1).map(() => -1)])

    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' })
    expect(buttons[1]).toHaveFocus()
    expect(buttons[1].tabIndex).toBe(0)
    expect(buttons[0].tabIndex).toBe(-1)

    fireEvent.keyDown(buttons[1], { key: 'ArrowLeft' })
    expect(buttons[0]).toHaveFocus()

    fireEvent.keyDown(buttons[0], { key: 'End' })
    expect(buttons[buttons.length - 1]).toHaveFocus()
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'Home' })
    expect(buttons[0]).toHaveFocus()
  })

  it('wraps arrow navigation around the ends', () => {
    render(<MarkdownToolbar onApply={() => {}} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' })
    const buttons = Array.from(toolbar.querySelectorAll('button'))
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowLeft' })
    expect(buttons[buttons.length - 1]).toHaveFocus()
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'ArrowRight' })
    expect(buttons[0]).toHaveFocus()
  })

  it('collapses to a single Tab stop on narrow screens too', () => {
    setViewport(true)
    render(<MarkdownToolbar onApply={() => {}} />)
    const buttons = Array.from(screen.getByRole('toolbar', { name: 'Text formatting' }).querySelectorAll('button'))
    expect(buttons).toHaveLength(3)
    expect(buttons.map(b => b.tabIndex)).toEqual([0, -1, -1])
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' })
    expect(buttons[1]).toHaveFocus()
    expect(buttons[1]).toHaveAttribute('tabindex', '0')
    expect(buttons[2]).toHaveAttribute('aria-haspopup', 'dialog')
  })
})
