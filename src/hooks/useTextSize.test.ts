import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTextSize, applyStoredTextSize } from './useTextSize'

describe('useTextSize', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-text-size')
  })

  it('defaults to normal with no attribute and persists it', () => {
    const { result } = renderHook(() => useTextSize())
    expect(result.current.textSize).toBe('normal')
    expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    expect(window.localStorage.getItem('rolebypost-text-size')).toBe('normal')
  })

  it('sets the data attribute and persists when a non-default size is chosen', () => {
    const { result } = renderHook(() => useTextSize())

    act(() => result.current.setSize('large'))
    expect(result.current.textSize).toBe('large')
    expect(document.documentElement.getAttribute('data-text-size')).toBe('large')
    expect(window.localStorage.getItem('rolebypost-text-size')).toBe('large')
  })

  it('removes the attribute when returning to normal', () => {
    const { result } = renderHook(() => useTextSize())

    act(() => result.current.setSize('xlarge'))
    expect(document.documentElement.getAttribute('data-text-size')).toBe('xlarge')

    act(() => result.current.setSize('normal'))
    expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
  })

  it('restores a saved size over the default', () => {
    window.localStorage.setItem('rolebypost-text-size', 'xlarge')
    const { result } = renderHook(() => useTextSize())
    expect(result.current.textSize).toBe('xlarge')
  })

  it('ignores an unknown saved value and falls back to normal', () => {
    window.localStorage.setItem('rolebypost-text-size', 'huge')
    const { result } = renderHook(() => useTextSize())
    expect(result.current.textSize).toBe('normal')
  })

  describe('applyStoredTextSize', () => {
    it('sets the attribute for a saved non-normal size', () => {
      window.localStorage.setItem('rolebypost-text-size', 'xlarge')
      applyStoredTextSize()
      expect(document.documentElement.getAttribute('data-text-size')).toBe('xlarge')
    })

    it('removes the attribute when the saved size is normal', () => {
      window.localStorage.setItem('rolebypost-text-size', 'normal')
      document.documentElement.setAttribute('data-text-size', 'large')
      applyStoredTextSize()
      expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    })

    it('leaves the attribute unset when nothing is saved', () => {
      applyStoredTextSize()
      expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    })

    it('ignores an unknown saved value and leaves the attribute unset', () => {
      window.localStorage.setItem('rolebypost-text-size', 'huge')
      applyStoredTextSize()
      expect(document.documentElement.hasAttribute('data-text-size')).toBe(false)
    })
  })
})