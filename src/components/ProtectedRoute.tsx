import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { confirmTerms } from '../features/auth/authApi'
import { CURRENT_TERMS_VERSION } from '../features/auth/terms'
import { ReConsentGate } from '../features/auth/ReConsentGate'
import { lazy, Suspense } from 'react'
const LoginPage = lazy(() => import('../features/auth/LoginPage').then(m => ({ default: m.LoginPage })))

export function ProtectedRoute() {
  const { user, profile, loading, error, refreshProfile } = useAuth()
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

  // Re-consent gate (#562 P2-2): a signed-in user whose stored terms version
  // is behind must re-accept before using the app. Unknown state (profile
  // still loading or a transient fetch failure) never gates.
  if (profile && profile.terms_version !== CURRENT_TERMS_VERSION) {
    return (
      <ReConsentGate
        onAccept={async () => {
          await confirmTerms(CURRENT_TERMS_VERSION)
          await refreshProfile()
        }}
      />
    )
  }

  return <Outlet />
}
