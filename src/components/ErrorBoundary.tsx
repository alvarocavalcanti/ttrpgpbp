import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { reportAppError } from '../lib/appErrorLog'
import { hardReload } from '../lib/hardReload'

interface ErrorBoundaryProps {
  children: ReactNode
  // Clears a caught error when this value changes. Lets the route boundary
  // recover on navigation without remounting (and refetching) the subtree.
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
  // The resetKey the boundary last rendered with, so a navigation can clear a
  // caught error without remounting the subtree through a React key.
  resetKey?: string
}

// Catches render errors anywhere below it so a single crashing component
// can't blank the whole app (M2). Fallback offers a reload.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (state.resetKey === props.resetKey) return null
    // A new resetKey means the player navigated: drop any caught error and
    // adopt the key. Scanning this in the render phase keeps the fix a pure
    // derivation instead of a state write after the commit.
    return { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info)
    reportAppError(error, { componentStack: info.componentStack ?? undefined })
  }

  handleReload = () => {
    hardReload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 px-4">
          <h1 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-center">
            An unexpected error occurred while rendering this page.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
