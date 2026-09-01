import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RouteErrorBoundary } from '../App'

// ErrorBoundary logs and reports via Sentry on catch; silence both in tests.
vi.mock('../lib/sentry', () => ({
  captureException: vi.fn(),
}))

function Crash(): never {
  throw new Error('boom')
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
})
