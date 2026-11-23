import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from '../App'

// ErrorBoundary logs and reports via Sentry on catch; silence both in tests.
vi.mock('../lib/sentry', () => ({
  captureException: vi.fn(),
}))

function Crash(): never {
  throw new Error('boom')
}

// Local state that only survives if the boundary keeps its child mounted.
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button type="button" data-testid="counter" onClick={() => setCount(c => c + 1)}>
      {count}
    </button>
  )
}

function CrashesInRoom() {
  const { pathname } = useLocation()
  if (pathname.includes('/sub/')) throw new Error('room exploded')
  return <div data-testid="healthy">ok</div>
}

describe('RouteErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('contains a route crash and keeps the rest of the app rendered', () => {
    render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <div>
          <div data-testid="nav">nav</div>
          <RouteErrorBoundary>
            <Crash />
          </RouteErrorBoundary>
        </div>
      </MemoryRouter>
    )

    expect(screen.getByTestId('nav')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('keeps the channel subtree mounted when only the room changes (#765)', () => {
    render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <RouteErrorBoundary>
          <Counter />
        </RouteErrorBoundary>
        <Link to="/channel/c1/sub/r1">open room</Link>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('counter'))
    expect(screen.getByTestId('counter')).toHaveTextContent('1')

    fireEvent.click(screen.getByText('open room'))

    // Same instance, same state: the room switch did not remount the subtree.
    expect(screen.getByTestId('counter')).toHaveTextContent('1')
  })

  it('remounts when the channel or the route section changes', () => {
    render(
      <MemoryRouter initialEntries={['/channel/c1/sub/r1']}>
        <RouteErrorBoundary>
          <Counter />
        </RouteErrorBoundary>
        <Link to="/channel/c2">other channel</Link>
        <Link to="/">lobby</Link>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('counter'))
    expect(screen.getByTestId('counter')).toHaveTextContent('1')

    fireEvent.click(screen.getByText('other channel'))
    expect(screen.getByTestId('counter')).toHaveTextContent('0')

    fireEvent.click(screen.getByTestId('counter'))
    fireEvent.click(screen.getByText('lobby'))
    expect(screen.getByTestId('counter')).toHaveTextContent('0')
  })

  it('clears a crash caught in a room when the player navigates to Main (#765)', () => {
    render(
      <MemoryRouter initialEntries={['/channel/c1/sub/r1']}>
        <RouteErrorBoundary>
          <CrashesInRoom />
        </RouteErrorBoundary>
        <Link to="/channel/c1">back to main</Link>
      </MemoryRouter>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    fireEvent.click(screen.getByText('back to main'))

    // Same boundary key (same channel), so the error state itself must reset.
    expect(screen.getByTestId('healthy')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})
