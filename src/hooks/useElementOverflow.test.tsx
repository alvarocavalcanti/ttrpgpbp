import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useElementOverflow } from './useElementOverflow'

// jsdom reports 0 for both; override so a test can simulate the clamped box
// (clientHeight) against the full content height (scrollHeight).
const setHeights = (scrollHeight: number, clientHeight: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight })
}

type ResizeObserverMock = { trigger: () => void; disconnect: () => void }

function Harness() {
  const { ref, overflows } = useElementOverflow<HTMLDivElement>()
  return (
    <div ref={ref} data-testid="box" className="line-clamp-1">
      {overflows ? 'overflows' : 'fits'}
    </div>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  setHeights(0, 0)
})

describe('useElementOverflow', () => {
  it('reports no overflow for single-line content', () => {
    setHeights(30, 30)
    render(<Harness />)
    expect(screen.getByTestId('box')).toHaveTextContent('fits')
  })

  it('reports overflow when the content is taller than the clamp', () => {
    setHeights(100, 30)
    render(<Harness />)
    expect(screen.getByTestId('box')).toHaveTextContent('overflows')
  })

  it('re-measures when the box resizes', () => {
    setHeights(30, 30)
    render(<Harness />)
    expect(screen.getByTestId('box')).toHaveTextContent('fits')

    const observer = (globalThis as unknown as { __resizeObservers: ResizeObserverMock[] }).__resizeObservers.at(-1)!
    setHeights(100, 30)
    act(() => observer.trigger())
    expect(screen.getByTestId('box')).toHaveTextContent('overflows')
  })

  it('re-measures when the content is replaced', async () => {
    setHeights(30, 30)
    render(<Harness />)
    const box = screen.getByTestId('box')
    expect(box).toHaveTextContent('fits')

    setHeights(100, 30)
    act(() => {
      box.appendChild(document.createElement('span'))
    })
    await waitFor(() => expect(box).toHaveTextContent('overflows'))
  })

  it('restores the clamp after measuring', () => {
    setHeights(100, 30)
    render(<Harness />)
    const box = screen.getByTestId('box')
    expect(box.style.getPropertyValue('-webkit-line-clamp')).toBe('')
    expect(box).toHaveTextContent('overflows')
  })

  it('disconnects both observers on unmount', () => {
    setHeights(30, 30)
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { unmount } = render(<Harness />)
    const observer = (globalThis as unknown as { __resizeObservers: ResizeObserverMock[] }).__resizeObservers.at(-1)!
    const resizeDisconnect = vi.spyOn(observer, 'disconnect')
    unmount()
    expect(resizeDisconnect).toHaveBeenCalledTimes(1)
    expect(mutationDisconnect).toHaveBeenCalledTimes(1)
  })

  it('does nothing until a node is attached', () => {
    setHeights(100, 30)
    function Unattached() {
      const { overflows } = useElementOverflow<HTMLDivElement>()
      return <span>{String(overflows)}</span>
    }
    render(<Unattached />)
    expect(screen.getByText('false')).toBeInTheDocument()
  })
})
