import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { confirmTerms } from '../features/auth/authApi'
import { CURRENT_TERMS_VERSION, TERMS_AGREED_KEY } from '../features/auth/terms'
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

  // Fail closed (#562 review): with a signed-in user but no profile yet, the
  // stored terms version is unknown — hold the loading state instead of
  // rendering the app before the terms check can run. (A failed fetch sets
  // error above and never reaches here.)
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

  // Update-only re-consent gate: first-time acceptance is recorded from the
  // sign-in checkbox (AuthContext stamps it), so a stale record with matching
  // checkbox evidence for the current version is still being recorded — not
  // gated. A stale record with no such evidence (a real terms bump, or a
  // pre-terms account with nothing recorded) must re-accept before using
  // the app.
  const termsStale = profile.terms_version !== CURRENT_TERMS_VERSION
  const checkboxCoversCurrent = localStorage.getItem(TERMS_AGREED_KEY) === CURRENT_TERMS_VERSION
  if (termsStale && !checkboxCoversCurrent) {
    return (
      <ReConsentGate
        previousVersion={profile.terms_version}
        onAccept={async () => {
          await confirmTerms(CURRENT_TERMS_VERSION)
          await refreshProfile()
        }}
      />
    )
  }

  return <Outlet />
}
