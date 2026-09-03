import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTextSize } from './useTextSize'

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
})