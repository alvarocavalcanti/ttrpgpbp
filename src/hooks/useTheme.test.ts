import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The theme is a module-level store (single source of truth), so each test
// re-imports it fresh — AFTER seeding matchMedia/localStorage — to reset the
// persisted theme state. Reading the module before that seed would capture the
// wrong initial theme.
type ThemeModule = typeof import('./useTheme')

async function freshTheme(): Promise<ThemeModule> {
  vi.resetModules()
  return await import('./useTheme')
}

function mockSystemPrefersDark() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any
}

function mockSystemPrefersLight() {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to the system preference', async () => {
    mockSystemPrefersDark()
    const mod = await freshTheme()
    const { result } = renderHook(() => mod.useTheme())
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('defaults to light when the system prefers light', async () => {
    mockSystemPrefersLight()
    const mod = await freshTheme()
    const { result } = renderHook(() => mod.useTheme())
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggles the dark class and persists the choice', async () => {
    mockSystemPrefersLight()
    const mod = await freshTheme()
    const { result } = renderHook(() => mod.useTheme())
    expect(result.current.isDark).toBe(false)

    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('rolebypost-theme')).toBe('dark')

    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(false)
    expect(window.localStorage.getItem('rolebypost-theme')).toBe('light')
  })

  it('restores a saved theme over the system preference', async () => {
    window.localStorage.setItem('rolebypost-theme', 'dark')
    mockSystemPrefersLight()
    const mod = await freshTheme()
    const { result } = renderHook(() => mod.useTheme())
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('keeps the browser theme-color meta in sync with the theme', async () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#f9fafb'
    document.head.appendChild(meta)
    mockSystemPrefersLight()

    const mod = await freshTheme()
    const { result } = renderHook(() => mod.useTheme())
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f9fafb')

    act(() => result.current.toggleTheme())
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#111827')

    act(() => result.current.toggleTheme())
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f9fafb')

    meta.remove()
  })

  it('keeps multiple consumers in sync (header toggle + drawer row)', async () => {
    mockSystemPrefersLight()
    const mod = await freshTheme()
    const a = renderHook(() => mod.useTheme())
    const b = renderHook(() => mod.useTheme())

    act(() => a.result.current.toggleTheme())
    expect(a.result.current.isDark).toBe(true)
    // The second instance reads the same store.
    expect(b.result.current.isDark).toBe(true)
  })
})