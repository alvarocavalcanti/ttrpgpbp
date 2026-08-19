import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './useAuth'
import { supabase } from '../../lib/supabase'
import { usePushNotifications } from './usePushNotifications'
import { useToast } from '../../contexts/ToastContext'
import { buildUserDataExport, downloadJson } from './exportUserData'
import { MAX_DISPLAY_NAME_LENGTH } from '../../constants'

export function ProfileSettings() {
  const { user, profile, signOut } = useAuth()
  const { addToast } = useToast()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

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
    updatePreferences
  } = usePushNotifications()

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name)
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id)

      if (error) throw error

      addToast('Profile updated successfully.', 'success')
    } catch (error) {
      console.error('Error updating profile:', error)
      addToast('Failed to update profile. Please try again.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const togglePushSubscription = async () => {
    try {
      if (isSubscribed) {
        await unsubscribeFromPush()
      } else {
        await subscribeToPush()
      }
    } catch (err: any) {
      console.error('Push notification error:', err)
      alert('Failed to update push notification settings. Please try again.')
    }
  }

  const pushUnavailable = !isConfigured || !isSupported || needsInstall

  const handleExport = async () => {
    if (!user) return
    setIsExporting(true)
    try {
      const data = await buildUserDataExport(user.id)
      downloadJson(data, `rolebypost_export_${user.id}.json`)
      addToast('Your data has been downloaded.', 'success')
    } catch (error) {
      console.error('Error exporting user data:', error)
      addToast('Failed to export your data. Please try again.', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDelete = async () => {
    if (!user) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      })
      if (error) throw error
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
      await signOut()
    } catch (error) {
      console.error('Error deleting account:', error)
      addToast('Failed to delete account. Please try again.', 'error')
      setIsDeleting(false)
    }
  }

  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Profile Settings</h2>
        
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="flex items-center space-x-6 mb-8">
            <div className="shrink-0">
              {profile.avatar_url ? (
                <img
                  className="h-24 w-24 object-cover rounded-full shadow-sm"
                  src={profile.avatar_url}
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shadow-sm">
                  <span className="text-3xl font-medium">
                    {displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Your Avatar</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Currently using your Google account picture.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                disabled
                value={user?.email || ''}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-500 dark:text-gray-400 px-3 py-2 border"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Your email is managed by your Google account.</p>
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Name
              </label>
              <input
                type="text"
                id="displayName"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSaving || !displayName.trim()}
                className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Notifications</h3>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
          {prefsLoading ? (
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          ) : (
            <>
              {/* Push Subscriptions - Device specific */}
              <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Push Notifications on this device</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {!isConfigured
                        ? 'Push notifications are not configured on the server.'
                        : needsInstall
                          ? 'Push notifications require installing the app. Tap Share → Add to Home Screen.'
                          : isSupported
                            ? 'Receive notifications even when the app is closed.'
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
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isSubscribed ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                      role="switch"
                      aria-checked={isSubscribed}
                    >
                      <span className="sr-only">Use push notifications</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-800 shadow ring-0 transition duration-200 ease-in-out ${isSubscribed ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Notification Preferences - Account wide */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Notification Types</h4>
                
                  <div className="flex items-start">
                  <div className="flex h-5 items-center">
                    <input
                      id="push_enabled"
                      type="checkbox"
                      checked={preferences?.push_enabled ?? false}
                      onChange={(e) => updatePreferences({ push_enabled: e.target.checked })}
                      disabled={pushUnavailable}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="push_enabled" className={`font-medium ${pushUnavailable ? 'text-gray-400 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>Send me Push Notifications</label>
                    <p className={`${pushUnavailable ? 'text-gray-400 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>Global toggle for push notifications across all devices.</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="flex h-5 items-center">
                    <input
                      id="badge_enabled"
                      type="checkbox"
                      checked={preferences?.badge_enabled ?? false}
                      onChange={(e) => updatePreferences({ badge_enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="badge_enabled" className="font-medium text-gray-700 dark:text-gray-300">Show Unread Badges</label>
                    <p className="text-gray-500 dark:text-gray-400">Show a red dot on channels with unread messages.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Account &amp; Data</h3>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Download My Data</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Export your profile, channel memberships, and authored messages as a JSON file.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isExporting ? 'Exporting...' : 'Download My Data'}
            </button>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-red-600 dark:text-red-400">Delete Account</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Permanently deletes your account and personal data. Your messages are kept
                  anonymous and your channels are handed to the server admin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Delete Account
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            See the{' '}
            <Link to="/privacy" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium">
              Privacy Policy
            </Link>{' '}
            for details on what data we store and how you can exercise your rights.
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80" aria-hidden="true" onClick={() => setShowDeleteConfirm(false)}></div>
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 id="delete-account-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                Delete your account?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This action is permanent and cannot be undone. Type <span className="font-semibold">DELETE</span> to confirm.
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                aria-label="Type DELETE to confirm"
                className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm px-3 py-2 border"
              />
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                  className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
