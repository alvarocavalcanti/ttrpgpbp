import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// Catches render errors anywhere below it so a single crashing component
// can't blank the whole app (M2). Fallback offers a reload.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info)
    Sentry.captureException(error, { extra: info as Record<string, unknown> })
  }

  handleReload = () => {
    window.location.reload()
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
