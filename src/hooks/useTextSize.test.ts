import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The size is a module-level store applied at import, so each test re-imports
// it fresh AFTER seeding localStorage — the same pattern as useTheme.
type TextSizeModule = typeof import('./useTextSize')

async function freshTextSize(): Promise<TextSizeModule> {
  vi.resetModules()
  return await import('./useTextSize')
}

describe('useTextSize', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.style.cssText = ''
  })

  it('defaults to 100% and leaves the scale at 1', async () => {
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())
    expect(result.current.percent).toBe(100)
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1')
  })

  it('restores a saved size and applies it before any component renders', async () => {
    window.localStorage.setItem('rolebypost-text-size', '125')
    const mod = await freshTextSize()
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.25')

    const { result } = renderHook(() => mod.useTextSize())
    expect(result.current.percent).toBe(125)
  })

  it('ignores a saved value that is not a number', async () => {
    window.localStorage.setItem('rolebypost-text-size', 'huge')
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())
    expect(result.current.percent).toBe(100)
  })

  it('clamps a saved value above the maximum to 150', async () => {
    window.localStorage.setItem('rolebypost-text-size', '500')
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())
    expect(result.current.percent).toBe(150)
  })

  it('clamps a saved value below the minimum to 75', async () => {
    window.localStorage.setItem('rolebypost-text-size', '10')
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())
    expect(result.current.percent).toBe(75)
  })

  it('snaps a saved value that is off-step to the nearest step', async () => {
    window.localStorage.setItem('rolebypost-text-size', '110')
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())
    expect(result.current.percent).toBe(100)
  })

  it('applies and persists a chosen size', async () => {
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())

    act(() => result.current.setPercent(150))
    expect(result.current.percent).toBe(150)
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5')
    expect(window.localStorage.getItem('rolebypost-text-size')).toBe('150')
  })

  it('clamps a chosen size outside the allowed range', async () => {
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())

    act(() => result.current.setPercent(999))
    expect(result.current.percent).toBe(150)

    act(() => result.current.setPercent(0))
    expect(result.current.percent).toBe(75)
  })

  it('falls back to 100% when a non-number is passed in', async () => {
    const mod = await freshTextSize()
    const { result } = renderHook(() => mod.useTextSize())

    act(() => result.current.setPercent(150))
    act(() => result.current.setPercent(Number.NaN))
    expect(result.current.percent).toBe(100)
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1')
  })

  it('falls back to 100% when localStorage cannot be read', async () => {
    const original = window.localStorage.getItem.bind(window.localStorage)
    window.localStorage.getItem = () => { throw new Error('denied') }
    try {
      const mod = await freshTextSize()
      const { result } = renderHook(() => mod.useTextSize())
      expect(result.current.percent).toBe(100)
      expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1')
    } finally {
      window.localStorage.getItem = original
    }
  })

  it('keeps multiple consumers in sync', async () => {
    const mod = await freshTextSize()
    const a = renderHook(() => mod.useTextSize())
    const b = renderHook(() => mod.useTextSize())

    act(() => a.result.current.setPercent(125))
    expect(a.result.current.percent).toBe(125)
    expect(b.result.current.percent).toBe(125)
  })
})
