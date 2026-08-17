import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to the system preference', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any

    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('defaults to light when the system prefers light', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any

    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggles the dark class and persists the choice', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any

    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(false)

    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('rolebypost-theme')).toBe('dark')

    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(false)
    expect(window.localStorage.getItem('rolebypost-theme')).toBe('light')
  })

  it('restores a saved theme over the system preference', () => {
    window.localStorage.setItem('rolebypost-theme', 'dark')
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any

    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('keeps the browser theme-color meta in sync with the theme', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#f9fafb'
    document.head.appendChild(meta)
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any

    const { result } = renderHook(() => useTheme())
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f9fafb')

    act(() => result.current.toggleTheme())
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#111827')

    act(() => result.current.toggleTheme())
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f9fafb')

    meta.remove()
  })
})
