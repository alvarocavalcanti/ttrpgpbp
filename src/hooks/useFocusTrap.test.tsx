import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'

function TrapDialog({ onClose }: { onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  return (
    <div>
      <button type="button" onClick={onClose}>Trigger</button>
      <div ref={ref} role="dialog" aria-modal="true">
        <button type="button">First</button>
        <button type="button">Middle</button>
        <button type="button">Last</button>
      </div>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves initial focus into the dialog', () => {
    const { getByRole } = render(<TrapDialog />)
    expect(getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('does not steal focus when the surface already focused something inside', () => {
    function AutofocusDialog() {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref)
      return (
        <div ref={ref} role="dialog">
          <button type="button" autoFocus>Input</button>
        </div>
      )
    }
    const { getByRole } = render(<AutofocusDialog />)
    expect(getByRole('button', { name: 'Input' })).toHaveFocus()
  })

  it('wraps Tab from the last focusable to the first', () => {
    const { getByRole } = render(<TrapDialog />)
    getByRole('button', { name: 'Last' }).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the first focusable to the last', () => {
    const { getByRole } = render(<TrapDialog />)
    getByRole('button', { name: 'First' }).focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('pulls focus back in when it lands outside the dialog', () => {
    const { getByRole } = render(<TrapDialog />)
    getByRole('button', { name: 'Trigger' }).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('restores focus to the trigger on unmount', () => {
    function Wrapper({ open }: { open: boolean }) {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref)
      return (
        <div>
          <button type="button">Trigger</button>
          {open && (
            <div ref={ref} role="dialog">
              <button type="button">First</button>
            </div>
          )}
        </div>
      )
    }
    const { getByRole, rerender } = render(<Wrapper open={false} />)
    const trigger = getByRole('button', { name: 'Trigger' })
    trigger.focus()
    rerender(<Wrapper open />)
    rerender(<Wrapper open={false} />)
    expect(trigger).toHaveFocus()
  })

  it('skips elements hidden or inside aria-hidden subtrees', () => {
    function DialogWithHidden() {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref)
      return (
        <div ref={ref} role="dialog">
          <button type="button" hidden>Hidden</button>
          <div aria-hidden="true">
            <button type="button">Backdrop</button>
          </div>
          <button type="button">Visible</button>
        </div>
      )
    }
    const { getByRole } = render(<DialogWithHidden />)
    expect(getByRole('button', { name: 'Visible' })).toHaveFocus()
    getByRole('button', { name: 'Visible' }).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(getByRole('button', { name: 'Visible' })).toHaveFocus()
  })

  it('focuses the container itself when it has no focusable children', () => {
    function EmptyDialog() {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref)
      return <div ref={ref} role="dialog" data-testid="empty" />
    }
    const { getByTestId } = render(<EmptyDialog />)
    expect(getByTestId('empty')).toHaveFocus()
  })

  it('leaves other keys alone', () => {
    const { getByRole } = render(<TrapDialog />)
    const last = getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(last).toHaveFocus()
  })

  it('cleans up the keydown listener on unmount', () => {
    const { unmount } = render(<TrapDialog />)
    const spy = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
    spy.mockRestore()
  })
})
