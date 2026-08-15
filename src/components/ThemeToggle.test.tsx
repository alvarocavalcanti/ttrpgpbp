import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

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

  it('toggles dark mode on click', () => {
    render(<ThemeToggle />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    fireEvent.click(screen.getByLabelText('Switch to dark mode'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {})
    fireEvent.click(screen.getByLabelText('Switch to light mode'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
