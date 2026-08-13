import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useEscapeToClose } from './useEscapeToClose'

describe('useEscapeToClose', () => {
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeToClose(onClose))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeToClose(onClose))

    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes the listener on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = renderHook(() => useEscapeToClose(onClose))
    unmount()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
