import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): ReactNode {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('renders the fallback and logs when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith('Uncaught render error:', expect.any(Error), expect.anything())
  })

  it('reloads the page from the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload },
      configurable: true,
    })

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
  })
})
