import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Menu } from './Menu'

const options = [
  { value: '', label: 'Everyone (Public)' },
  { value: 'u1', label: 'Hero', hint: 'P1' },
  { value: 'u2', label: 'Archer', hint: 'P2' },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Menu', () => {
  it('shows the label and current selection on the trigger', () => {
    render(<Menu label="Whisper" value="u1" options={options} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Whisper/ })).toHaveTextContent('Hero')
  })

  it('opens and lists the options', () => {
    render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(screen.getByRole('menu', { name: 'Whisper' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Hero/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Archer/ })).toBeInTheDocument()
  })

  it('opens upward by default', () => {
    render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(screen.getByRole('menu', { name: 'Whisper' })).toHaveClass('bottom-full')
  })

  it('opens as a dialog popup when popup is true', () => {
    render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} popup />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(screen.getByRole('dialog', { name: 'Whisper' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Hero/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Archer/ })).toBeInTheDocument()
  })

  it('selects an option from the popup and closes', () => {
    const onSelect = vi.fn()
    render(<Menu label="Whisper" value="" options={options} onSelect={onSelect} popup />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    expect(onSelect).toHaveBeenCalledWith('u1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the popup on Escape', () => {
    render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} popup />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks the current value as checked', () => {
    render(<Menu label="Whisper" value="u1" options={options} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(screen.getByRole('menuitemradio', { name: /Hero/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: /Archer/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('selects an option and closes', () => {
    const onSelect = vi.fn()
    render(<Menu label="Whisper" value="" options={options} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hero/ }))
    expect(onSelect).toHaveBeenCalledWith('u1')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on click outside', () => {
    render(
      <div>
        <Menu label="Whisper" value="" options={options} onSelect={vi.fn()} />
        <button type="button">outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('navigates with arrow keys and selects on Enter', () => {
    const onSelect = vi.fn()
    render(<Menu label="Whisper" value="" options={options} onSelect={onSelect} />)
    const trigger = screen.getByRole('button', { name: /Whisper/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('u1')
  })
})

describe('Menu popup/dropdown parity', () => {
  const labels = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('[role="menuitemradio"]')).map(b => b.textContent)

  it('lists identical options in dropdown and popup variants', () => {
    const dropdown = render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    const dropdownLabels = labels(dropdown.container)

    dropdown.unmount()
    const popup = render(<Menu label="Whisper" value="" options={options} onSelect={vi.fn()} popup />)
    fireEvent.click(screen.getByRole('button', { name: /Whisper/ }))
    expect(labels(popup.container)).toEqual(dropdownLabels)
  })

  it('supports keyboard selection in both variants', () => {
    for (const popup of [false, true]) {
      const onSelect = vi.fn()
      const { unmount } = render(<Menu label="Whisper" value="" options={options} onSelect={onSelect} popup={popup} />)
      const trigger = screen.getByRole('button', { name: /Whisper/ })
      fireEvent.click(trigger)
      fireEvent.keyDown(trigger, { key: 'ArrowDown' })
      fireEvent.keyDown(trigger, { key: 'Enter' })
      expect(onSelect).toHaveBeenCalledWith('u1')
      unmount()
    }
  })
})
