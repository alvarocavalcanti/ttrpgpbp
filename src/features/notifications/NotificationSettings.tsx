import { useState } from 'react'
import { usePushNotifications } from './usePushNotifications'
import { useToast } from '../../contexts/ToastContext'

/**
 * Notification settings page: the device push subscription, the global
 * notification toggles, and a test notification. Pulled out of the account
 * page (#818) — notifications are device/account behavior, not profile
 * customization.
 */
export function NotificationSettings() {
  const {
    isSupported,
    needsInstall,
    isConfigured,
    permission,
    isSubscribed,
    preferences,
    loading: prefsLoading,
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification,
    updatePreferences
  } = usePushNotifications()
  const { addToast } = useToast()
  const [isSendingTest, setIsSendingTest] = useState(false)

  const togglePushSubscription = async () => {
    try {
      if (isSubscribed) {
        await unsubscribeFromPush()
      } else {
        await subscribeToPush()
      }
    } catch (err) {
      console.error('Push notification error:', err)
      addToast('Failed to update push notification settings. Please try again.', 'error')
    }
  }

  const pushUnavailable = !isConfigured || !isSupported || needsInstall

  // Installed Android apps have their own notification permission, separate
  // from the website's — the only place our own UI can point a player at it.
  const installedOnAndroid =
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent) &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches

  const handleSendTestNotification = async () => {
    setIsSendingTest(true)
    try {
      await sendTestNotification()
      addToast('Test notification sent — check your notification shade.', 'success')
    } catch (err) {
      console.error('Test notification error:', err)
      addToast(
        err instanceof Error ? err.message : 'Could not show a test notification on this device.',
        'error'
      )
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-8">Notifications</h2>

      <div className="bg-white dark:bg-surface-800 shadow rounded-lg p-6 space-y-6">
        {prefsLoading ? (
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-3/4"></div>
              <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-1/2"></div>
            </div>
          </div>
        ) : (
          <>
            {/* Push Subscriptions - Device specific */}
            <div className="border-b border-surface-200 dark:border-surface-700 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-surface-900 dark:text-surface-100">Push Notifications on this device</h3>
                  <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    {!isConfigured
                      ? 'Push notifications are not configured on the server.'
                      : needsInstall
                        ? 'Push notifications require installing the app. Tap Share → Add to Home Screen.'
                        : isSupported
                          ? 'Receive notifications even when the app is closed. Your browser may hold them back while the phone sleeps.'
                          : 'Push notifications are not supported on this browser/device.'}
                  </p>
                  {isConfigured && isSupported && permission === 'denied' && (
                    <p className="text-sm text-red-500 dark:text-red-400 mt-1">
                      You have blocked notifications. You must allow them in your browser settings.
                    </p>
                  )}
                </div>
                {isConfigured && isSupported && (
                  <button
                    type="button"
                    onClick={togglePushSubscription}
                    disabled={permission === 'denied'}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${isSubscribed ? 'bg-primary-600' : 'bg-surface-200 dark:bg-surface-700'}`}
                    role="switch"
                    aria-checked={isSubscribed}
                  >
                    <span className="sr-only">Use push notifications</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-surface-800 shadow ring-0 transition duration-200 ease-in-out ${isSubscribed ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                )}
              </div>
              {isConfigured && isSupported && isSubscribed && permission === 'granted' && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    disabled={isSendingTest}
                    className="rounded-lg border border-surface-300 dark:border-surface-600 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSendingTest ? 'Sending…' : 'Send test notification'}
                  </button>
                  {installedOnAndroid && (
                    <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">
                      If nothing appears, your phone is blocking notifications for this app or your
                      browser. Allow them in Settings → Apps → RoleByPost (or your browser) →
                      Notifications.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Notification Preferences - Account wide */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-surface-900 dark:text-surface-100">Notification Types</h3>

              <div className="flex items-start">
                <div className="flex h-5 items-center">
                  <input
                    id="push_enabled"
                    type="checkbox"
                    checked={preferences?.push_enabled ?? false}
                    onChange={(e) => updatePreferences({ push_enabled: e.target.checked })}
                    disabled={pushUnavailable}
                    className="h-4 w-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 dark:text-primary-400 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="push_enabled" className={`font-medium ${pushUnavailable ? 'text-surface-400 dark:text-surface-400' : 'text-surface-700 dark:text-surface-300'}`}>Send me Push Notifications</label>
                  <p className={`${pushUnavailable ? 'text-surface-400 dark:text-surface-400' : 'text-surface-500 dark:text-surface-400'}`}>Global toggle for push notifications across all devices.</p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex h-5 items-center">
                  <input
                    id="badge_enabled"
                    type="checkbox"
                    checked={preferences?.badge_enabled ?? false}
                    onChange={(e) => updatePreferences({ badge_enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 dark:text-primary-400 focus:ring-primary-500"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="badge_enabled" className="font-medium text-surface-700 dark:text-surface-300">Show App Icon Badge</label>
                  <p className="text-surface-500 dark:text-surface-400">Show the unread count on the app icon (home screen or taskbar). Unread markers inside the app are always shown.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
