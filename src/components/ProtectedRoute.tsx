import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { confirmAge, confirmTerms } from '../features/auth/authApi'
import { CURRENT_TERMS_VERSION, TERMS_AGREED_KEY } from '../features/auth/terms'
import { ReConsentGate } from '../features/auth/ReConsentGate'
import { lazy, Suspense } from 'react'
const LoginPage = lazy(() => import('../features/auth/LoginPage').then(m => ({ default: m.LoginPage })))

export function ProtectedRoute() {
  const { user, profile, loading, error, refreshProfile, termsConfirmState, retryTermsConfirm } = useAuth()
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
  // checkbox evidence for the current version is still being recorded — the
  // app holds (never the Outlet) until the server record lands, and offers a
  // retry — not a re-accept — if recording failed. A stale record with no such
  // evidence (a real terms bump, or a pre-terms account with nothing recorded)
  // must re-accept before using the app.
  const termsStale = profile.terms_version !== CURRENT_TERMS_VERSION
  const checkboxCoversCurrent = localStorage.getItem(TERMS_AGREED_KEY) === CURRENT_TERMS_VERSION
  if (termsStale && checkboxCoversCurrent) {
    if (termsConfirmState === 'failed') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div role="alert" className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-6 py-4 text-sm text-red-700 dark:text-red-400 max-w-md text-center">
            <p>We could not save your agreement to the Terms. Check your connection and try again — you won&apos;t need to re-accept.</p>
            <button
              type="button"
              onClick={retryTermsConfirm}
              className="mt-3 inline-flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }
  if (termsStale) {
    return (
      <ReConsentGate
        previousVersion={profile.terms_version}
        requiresAge={!profile.age_verified_at}
        onAccept={async () => {
          // Pre-age-gate accounts never stamped 16+; collect it with the
          // re-acceptance so the age evidence is not left NULL (2026-09-25
          // legal audit P2-1).
          if (!profile.age_verified_at) await confirmAge()
          await confirmTerms(CURRENT_TERMS_VERSION)
          await refreshProfile()
        }}
      />
    )
  }

  return <Outlet />
}
