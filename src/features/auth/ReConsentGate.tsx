import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_TERMS_VERSION } from './terms'

// Full-screen gate shown by ProtectedRoute when the signed-in user's stored
// terms version is behind CURRENT_TERMS_VERSION (#562 P2-2). The user reads
// the policies (public routes, so the gate unmounts while reading) and
// accepts; the caller stamps the acceptance and refreshes the profile.
// Escape does not dismiss — acceptance is required to use the app.
export function ReConsentGate({ onAccept }: { onAccept: () => Promise<void> }) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAccept = async () => {
    setAccepting(true)
    setError(null)
    try {
      await onAccept()
    } catch {
      setError('Could not record your acceptance. Please try again.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="re-consent-title" className="w-full max-w-md bg-white dark:bg-surface-800 rounded-xl shadow-md p-8">
        <h2 id="re-consent-title" className="text-xl font-extrabold text-surface-900 dark:text-surface-100">
          Terms of Service &amp; Privacy Policy
        </h2>
        <p className="mt-2 text-sm text-surface-600 dark:text-surface-400">
          To use Role by Post, please review and accept our Terms of Service and Privacy Policy.
        </p>
        <div className="mt-3 flex gap-4 text-sm">
          <Link to="/terms" className="text-primary-600 dark:text-primary-400 hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">
            Privacy Policy
          </Link>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => { void handleAccept() }}
          disabled={accepting}
          className="mt-6 w-full flex justify-center py-3 px-4 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accepting ? 'Recording…' : `I agree to the Terms (v${CURRENT_TERMS_VERSION})`}
        </button>
      </div>
    </div>
  )
}
