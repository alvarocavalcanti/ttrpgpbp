import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider, useToast } from './ToastContext'

const TestComponent = () => {
  const { addToast } = useToast()
  return (
    <div>
      <button type="button" onClick={() => addToast('Success!', 'success')}>Add Success</button>
      <button type="button" onClick={() => addToast('Error!', 'error')}>Add Error</button>
      <button type="button" onClick={() => addToast('Info!', 'info')}>Add Info</button>
      <button type="button" onClick={() => {
         addToast('Success 1', 'success');
         addToast('Success 2', 'success');
         addToast('Success 3', 'success');
         addToast('Success 4', 'success');
         addToast('Success 5', 'success');
         addToast('Success 6', 'success');
      }}>Add Many</button>
    </div>
  )
}

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws error when used outside provider', () => {
    // Suppress console.error for expected React error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestComponent />)).toThrow('useToast must be used within a ToastProvider')
    spy.mockRestore()
  })

  it('adds and renders toasts with correct types', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    act(() => { screen.getByText('Add Success').click() })
    expect(screen.getByText('Success!')).toBeInTheDocument()

    act(() => { screen.getByText('Add Error').click() })
    expect(screen.getByText('Error!')).toBeInTheDocument()

    act(() => { screen.getByText('Add Info').click() })
    expect(screen.getByText('Info!')).toBeInTheDocument()
  })

  it('auto-dismisses toast after 3 seconds', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    act(() => { screen.getByText('Add Success').click() })
    expect(screen.getByText('Success!')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Success!')).not.toBeInTheDocument()
  })

  it('removes toast when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    act(() => { screen.getByText('Add Success').click() })
    expect(screen.getByText('Success!')).toBeInTheDocument()

    act(() => { screen.getByRole('button', { name: 'Close' }).click() })
    expect(screen.queryByText('Success!')).not.toBeInTheDocument()

    // timer for the removed toast should be cleared
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Success!')).not.toBeInTheDocument()
  })

  it('limits to 5 toasts', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    act(() => { screen.getByText('Add Many').click() })

    // It should have 2 through 6
    expect(screen.queryByText('Success 1')).not.toBeInTheDocument()
    expect(screen.getByText('Success 2')).toBeInTheDocument()
    expect(screen.getByText('Success 6')).toBeInTheDocument()
  })
})
