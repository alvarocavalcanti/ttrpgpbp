import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  })) as any
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMediaQuery', () => {
  it('returns false when matchMedia reports no match', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when matchMedia reports a match', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'))
    expect(result.current).toBe(true)
  })

  it('updates when the media query match changes', () => {
    const listeners: Array<() => void> = []
    const mql = {
      matches: false,
      media: '(max-width: 640px)',
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }
    window.matchMedia = (() => mql) as any

    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'))
    expect(result.current).toBe(false)

    mql.matches = true
    act(() => listeners.forEach(cb => cb()))
    expect(result.current).toBe(true)
  })
})
