import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ThemeToggle consumes the module-level theme store, so re-import it fresh per
// test to reset persisted state.
type ThemeToggleModule = typeof import('./ThemeToggle')

async function freshToggle(): Promise<ThemeToggleModule> {
  vi.resetModules()
  return await import('./ThemeToggle')
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any
  })

  it('toggles dark mode on click', async () => {
    const mod = await freshToggle()
    render(<mod.ThemeToggle />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    fireEvent.click(screen.getByLabelText('Switch to dark mode'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(screen.getByLabelText('Switch to light mode'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})