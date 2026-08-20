import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { lazy, Suspense } from 'react'
const LoginPage = lazy(() => import('../features/auth/LoginPage').then(m => ({ default: m.LoginPage })))

export function ProtectedRoute() {
  const { user, loading, error } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900" role="alert">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-6 py-4 text-sm text-red-700 dark:text-red-400 max-w-md text-center">
          Failed to load your session. Please refresh the page or try signing in again.
        </div>
      </div>
    )
  }

  if (!user) {
    if (location.pathname === '/') {
      return <Suspense fallback={null}><LoginPage /></Suspense>
    }
    const from = location.pathname + location.search + location.hash
    return <Navigate to="/login" replace state={{ from }} />
  }

  const redirectTo = sessionStorage.getItem('auth_redirect')
  if (redirectTo?.startsWith('/') && !redirectTo.startsWith('//')) {
    sessionStorage.removeItem('auth_redirect')
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
