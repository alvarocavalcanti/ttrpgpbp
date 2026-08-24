import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useClickOutside } from './useClickOutside'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useClickOutside', () => {
  it('calls the handler when clicking outside the element', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useClickOutside<HTMLDivElement>(onClose))
    const el = document.createElement('div')
    result.current.current = el
    document.body.appendChild(el)

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).toHaveBeenCalled()

    document.body.removeChild(el)
    document.body.removeChild(outside)
  })

  it('does not call the handler when clicking inside the element', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useClickOutside<HTMLDivElement>(onClose))
    const el = document.createElement('div')
    result.current.current = el
    document.body.appendChild(el)

    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('does not attach listeners when inactive', () => {
    const onClose = vi.fn()
    renderHook(() => useClickOutside<HTMLDivElement>(onClose, false))
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
