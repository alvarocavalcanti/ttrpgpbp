import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { LoginPage } from '../features/auth/LoginPage'

export function ProtectedRoute() {
  const { user, loading, error } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" role="alert">
        <div className="bg-red-50 border border-red-200 rounded-md px-6 py-4 text-sm text-red-700 max-w-md text-center">
          Failed to load your session. Please refresh the page or try signing in again.
        </div>
      </div>
    )
  }

  if (!user) {
    if (location.pathname === '/') {
      return <LoginPage />
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
