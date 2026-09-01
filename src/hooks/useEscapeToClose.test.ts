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

  it('only closes the topmost modal when modals are nested', () => {
    const closeParent = vi.fn()
    const closeChild = vi.fn()
    // Parent mounts first (registered first, like ChannelSettings -> ConfirmDialog).
    const parent = renderHook(() => useEscapeToClose(closeParent))
    const child = renderHook(() => useEscapeToClose(closeChild))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeChild).toHaveBeenCalledTimes(1)
    expect(closeParent).not.toHaveBeenCalled()

    // After the child closes (unmounts), Escape reaches the parent again.
    child.unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeParent).toHaveBeenCalledTimes(1)

    // And after the parent closes too, neither fires.
    parent.unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeParent).toHaveBeenCalledTimes(1)
    expect(closeChild).toHaveBeenCalledTimes(1)
  })
})
