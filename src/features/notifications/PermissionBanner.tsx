import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { usePushNotifications } from '../auth/usePushNotifications'

const DISMISS_KEY = 'notifications:banner-dismissed'

// sessionStorage keeps the dismissal for the current tab session: navigating
// away and back no longer resurrects the banner, but it can return next
// session. Storage can throw (Safari private mode); never let it break render.
function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

function persistDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, 'true')
  } catch {
    // ignore
  }
}

export function PermissionBanner() {
  const { user } = useAuth()
  const { isSupported, needsInstall, isConfigured, permission, isSubscribed, subscribeToPush } = usePushNotifications()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || dismissed || !isConfigured || !isSupported || needsInstall || permission !== 'default' || isSubscribed) {
    return null
  }

  const handleEnable = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      await subscribeToPush()
      persistDismissed()
      setDismissed(true)
    } catch (err) {
      console.error('Failed to enable notifications', err)
      setError('Could not enable notifications. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-3 flex items-center justify-between gap-4 mx-4 md:mx-0" role="region" aria-label="Notification permission">
      <div>
        <p className="text-sm text-indigo-900 dark:text-indigo-200">
          Enable push notifications to get notified of new messages, even when the app is closed.
        </p>
        {error && <p className="text-sm text-red-700 dark:text-red-400 mt-1" role="alert">{error}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleEnable}
          disabled={isSubmitting}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Enabling...' : 'Enable Notifications'}
        </button>
        <button
          type="button"
          onClick={() => {
            persistDismissed()
            setDismissed(true)
          }}
          className="px-3 py-1.5 text-gray-500 dark:text-gray-400 text-sm font-medium rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900"
          aria-label="Dismiss notification banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
