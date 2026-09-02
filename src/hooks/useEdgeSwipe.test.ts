import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEdgeSwipe } from './useEdgeSwipe'

const fireTouch = (element: Window, type: 'touchstart' | 'touchend', x: number, y: number) => {
  const event = new Event(type, { bubbles: true }) as unknown as TouchEvent
  Object.defineProperty(event, 'changedTouches', {
    value: [{ clientX: x, clientY: y }],
  })
  element.dispatchEvent(event)
}

const INNER_WIDTH = 390

describe('useEdgeSwipe', () => {
  let onOpen: () => void
  let onClose: () => void

  beforeEach(() => {
    onOpen = vi.fn()
    onClose = vi.fn()
    Object.defineProperty(window, 'innerWidth', { value: INNER_WIDTH, configurable: true })
  })

  it('opens when a leftward swipe starts in the right-edge zone', () => {
    renderHook(() => useEdgeSwipe({ open: false, onOpen, onClose }))
    fireTouch(window, 'touchstart', INNER_WIDTH - 10, 200)
    fireTouch(window, 'touchend', INNER_WIDTH - 110, 200)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores swipes starting outside the edge zone', () => {
    renderHook(() => useEdgeSwipe({ open: false, onOpen, onClose }))
    fireTouch(window, 'touchstart', INNER_WIDTH - 100, 200)
    fireTouch(window, 'touchend', INNER_WIDTH - 200, 200)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('ignores short swipes below the threshold', () => {
    renderHook(() => useEdgeSwipe({ open: false, onOpen, onClose }))
    fireTouch(window, 'touchstart', INNER_WIDTH - 10, 200)
    fireTouch(window, 'touchend', INNER_WIDTH - 40, 200)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('ignores vertical-scrolling gestures', () => {
    renderHook(() => useEdgeSwipe({ open: false, onOpen, onClose }))
    fireTouch(window, 'touchstart', INNER_WIDTH - 10, 200)
    fireTouch(window, 'touchend', INNER_WIDTH - 110, 400)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('closes on a rightward swipe while open, from anywhere on screen', () => {
    renderHook(() => useEdgeSwipe({ open: true, onOpen, onClose }))
    fireTouch(window, 'touchstart', 100, 200)
    fireTouch(window, 'touchend', 200, 200)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does not close on a rightward swipe while closed', () => {
    renderHook(() => useEdgeSwipe({ open: false, onOpen, onClose }))
    fireTouch(window, 'touchstart', 100, 200)
    fireTouch(window, 'touchend', 200, 200)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useEdgeSwipe({ open: false, onOpen, onClose }))
    unmount()
    fireTouch(window, 'touchstart', INNER_WIDTH - 10, 200)
    fireTouch(window, 'touchend', INNER_WIDTH - 110, 200)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
