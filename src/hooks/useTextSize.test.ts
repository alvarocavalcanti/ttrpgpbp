import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTextSize, applyStoredTextSize, TEXT_SIZE_NORMAL, TEXT_SIZE_LARGE, TEXT_SIZE_XLARGE } from './useTextSize'

const STORAGE_KEY = 'rolebypost-text-size'

describe('useTextSize', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-text-size')
  })

  it('defaults to normal with no attribute and persists it', () => {
    const { result } = renderHook(() => useTextSize())
    expect(result.current.textSize).toBe(TEXT_SIZE_NORMAL)
    expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(TEXT_SIZE_NORMAL)
  })

  it('sets the data attribute and persists when a non-default size is chosen', () => {
    const { result } = renderHook(() => useTextSize())

    act(() => result.current.setSize(TEXT_SIZE_LARGE))
    expect(result.current.textSize).toBe(TEXT_SIZE_LARGE)
    expect(document.documentElement.getAttribute('data-text-size')).toBe(TEXT_SIZE_LARGE)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(TEXT_SIZE_LARGE)
  })

  it('removes the attribute when returning to normal', () => {
    const { result } = renderHook(() => useTextSize())

    act(() => result.current.setSize(TEXT_SIZE_XLARGE))
    expect(document.documentElement.getAttribute('data-text-size')).toBe(TEXT_SIZE_XLARGE)

    act(() => result.current.setSize(TEXT_SIZE_NORMAL))
    expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
  })

  it('restores a saved size over the default', () => {
    window.localStorage.setItem(STORAGE_KEY, TEXT_SIZE_XLARGE)
    const { result } = renderHook(() => useTextSize())
    expect(result.current.textSize).toBe(TEXT_SIZE_XLARGE)
  })

  it('ignores an unknown saved value and falls back to normal', () => {
    window.localStorage.setItem(STORAGE_KEY, 'huge')
    const { result } = renderHook(() => useTextSize())
    expect(result.current.textSize).toBe(TEXT_SIZE_NORMAL)
  })

  describe('applyStoredTextSize', () => {
    it('sets the attribute for a saved non-normal size', () => {
      window.localStorage.setItem(STORAGE_KEY, TEXT_SIZE_XLARGE)
      applyStoredTextSize()
      expect(document.documentElement.getAttribute('data-text-size')).toBe(TEXT_SIZE_XLARGE)
    })

    it('removes the attribute when the saved size is normal', () => {
      window.localStorage.setItem(STORAGE_KEY, TEXT_SIZE_NORMAL)
      document.documentElement.setAttribute('data-text-size', TEXT_SIZE_LARGE)
      applyStoredTextSize()
      expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    })

    it('leaves the attribute unset when nothing is saved', () => {
      applyStoredTextSize()
      expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    })

    it('ignores an unknown saved value and leaves the attribute unset', () => {
      window.localStorage.setItem(STORAGE_KEY, 'huge')
      applyStoredTextSize()
      expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    })

    it('falls back to normal when localStorage access throws', () => {
      const original = window.localStorage.getItem.bind(window.localStorage)
      window.localStorage.getItem = () => { throw new Error('denied') }
      try {
        applyStoredTextSize()
        expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
      } finally {
        window.localStorage.getItem = original
      }
    })
  })
})