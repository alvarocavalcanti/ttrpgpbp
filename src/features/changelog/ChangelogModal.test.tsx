import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ChangelogModal } from './ChangelogModal'
import type { ChangelogItem } from './changelog'

const items: ChangelogItem[] = [
  { version: '[Unreleased]', section: 'Added', title: 'Feature One', body: 'First feature.' },
  { version: '[Unreleased]', section: 'Added', title: 'Feature Two', body: 'Second feature.' },
]

describe('ChangelogModal', () => {
  it('renders the 5 most recent items passed in', () => {
    render(
      <MemoryRouter>
        <ChangelogModal items={items} onDismiss={vi.fn()} onDismissForever={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument()
    expect(screen.getByText('Feature One')).toBeInTheDocument()
    expect(screen.getByText('First feature.')).toBeInTheDocument()
    expect(screen.getByText('Feature Two')).toBeInTheDocument()
  })

  it('renders markdown in item bodies', () => {
    const mdItems: ChangelogItem[] = [
      { version: '[Unreleased]', section: 'Updated', title: 'Roll messages show their maths', body: 'a roll like `Rolled 1d20+3: 10 + 3 = **13**` reads the total so you can follow along' },
    ]
    render(
      <MemoryRouter>
        <ChangelogModal items={mdItems} onDismiss={vi.fn()} onDismissForever={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    )
    const code = screen.getByText('Rolled 1d20+3: 10 + 3 = **13**', { selector: 'code' })
    expect(code).toBeInTheDocument()
    expect(code.textContent).toContain('**13**')
  })

  it('links to the full changelog page', () => {
    render(
      <MemoryRouter>
        <ChangelogModal items={items} onDismiss={vi.fn()} onDismissForever={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    )
    const link = screen.getByRole('link', { name: 'View full changelog' })
    expect(link).toHaveAttribute('href', '/changelog')
  })

  it('shows an empty state when there are no items', () => {
    render(
      <MemoryRouter>
        <ChangelogModal items={[]} onDismiss={vi.fn()} onDismissForever={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByText('No recent changes.')).toBeInTheDocument()
  })

  it('calls onDismiss for the dismiss button', () => {
    const onDismiss = vi.fn()
    render(
      <MemoryRouter>
        <ChangelogModal items={items} onDismiss={onDismiss} onDismissForever={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it("calls onDismissForever for the don't-show-again button", () => {
    const onDismissForever = vi.fn()
    render(
      <MemoryRouter>
        <ChangelogModal items={items} onDismiss={vi.fn()} onDismissForever={onDismissForever} onClose={vi.fn()} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: "Don't show again" }))
    expect(onDismissForever).toHaveBeenCalled()
  })

  it('calls onClose on the close button, backdrop and Escape', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <MemoryRouter>
        <ChangelogModal items={items} onDismiss={vi.fn()} onDismissForever={vi.fn()} onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('dialog').previousElementSibling!)
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
    unmount()
  })
})
