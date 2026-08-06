import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { usePushNotifications } from '../auth/usePushNotifications'

export function PermissionBanner() {
  const { user } = useAuth()
  const { isSupported, isConfigured, permission, isSubscribed, subscribeToPush } = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!user || dismissed || !isConfigured || !isSupported || permission !== 'default' || isSubscribed) {
    return null
  }

  const handleEnable = async () => {
    setIsSubmitting(true)
    try {
      await subscribeToPush()
      setDismissed(true)
    } catch (err) {
      console.error('Failed to enable notifications', err)
      setDismissed(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4 mx-4 md:mx-0" role="region" aria-label="Notification permission">
      <p className="text-sm text-indigo-900">
        Enable push notifications to get notified of new messages, even when the app is closed.
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleEnable}
          disabled={isSubmitting}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Enabling...' : 'Enable Notifications'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-1.5 text-gray-500 text-sm font-medium rounded-md hover:bg-indigo-100"
          aria-label="Dismiss notification banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
