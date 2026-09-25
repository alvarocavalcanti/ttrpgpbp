import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_TERMS_VERSION } from './terms'

// Full-screen gate shown by ProtectedRoute when the signed-in user's stored
// terms version is behind CURRENT_TERMS_VERSION with no matching sign-in
// checkbox evidence for the current version. First-time acceptance is
// recorded from the sign-in checkbox instead (see AuthContext), so this gate
// only appears when the documents changed after the user last accepted — or
// once as a fail-safe for accounts with no recorded acceptance at all. The
// user reads the policies (public routes, so the gate unmounts while reading)
// and accepts; the caller stamps the acceptance and refreshes the profile.
// Escape does not dismiss — acceptance is required to use the app.
export function ReConsentGate({ onAccept, previousVersion, requiresAge = false }: { onAccept: () => Promise<void>; previousVersion: string | null; requiresAge?: boolean }) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Accounts that predate the age gate (or never stamped it) must attest 16+
  // here too, otherwise accepting the updated terms would let them in without
  // an age record.
  const [ageConfirmed, setAgeConfirmed] = useState(!requiresAge)

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
          Our Terms and Privacy Policy have changed
        </h2>
        <p className="mt-2 text-sm text-surface-600 dark:text-surface-400">
          {previousVersion
            ? `You last accepted version ${previousVersion}. Please review and accept version ${CURRENT_TERMS_VERSION} to keep using Role by Post.`
            : `Please review and accept version ${CURRENT_TERMS_VERSION} to keep using Role by Post.`}
        </p>
        <div className="mt-3 flex gap-4 text-sm">
          <Link to="/terms" className="text-primary-600 dark:text-primary-400 hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">
            Privacy Policy
          </Link>
        </div>
        {requiresAge && (
          <label className="mt-4 flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={e => setAgeConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span>I am at least 16 years old.</span>
          </label>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => { void handleAccept() }}
          disabled={accepting || !ageConfirmed}
          className="mt-6 w-full flex justify-center py-3 px-4 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accepting ? 'Recording…' : `I accept the updated Terms (v${CURRENT_TERMS_VERSION})`}
        </button>
      </div>
    </div>
  )
}
