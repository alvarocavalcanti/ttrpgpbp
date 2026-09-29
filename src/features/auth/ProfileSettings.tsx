import { Avatar } from '../../components/Avatar';
import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useAuth } from './useAuth'
import { deleteAccount, updateAvatarUrl, updateDisplayName, updateEmailOptIn } from './authApi'
import { useProfileAvatar } from './useProfileAvatar'
import { isBucketImagePath } from '../../hooks/useSignedImageUrl'
import { usePushNotifications } from '../notifications/usePushNotifications'
import { useToast } from '../../contexts/ToastContext'
import { buildUserDataExport, downloadJson } from './exportUserData'
import { MAX_DISPLAY_NAME_LENGTH } from '../../constants'
import { env } from '../../env'
import { initAnalytics, trackPageView, disableAnalytics } from '../../lib/analytics'
import { hasAnalyticsConsent, setAnalyticsConsent } from '../../lib/analyticsConsent'

/**
 * Account settings page: display name, notification preferences, data
 * export, and account deletion. Text sizing follows the device default —
 * there is intentionally no in-app text-size control (#523).
 */
export function ProfileSettings() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { addToast } = useToast()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResettingAvatar, setIsResettingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const emailOptIn = profile?.email_opt_in ?? false
  const { uploadEnabled, settingsLoading, uploading, uploadAvatar } = useProfileAvatar(user?.id, refreshProfile)

  const metadataAvatarUrl = user?.user_metadata?.avatar_url
  const googleAvatarUrl =
    typeof metadataAvatarUrl === 'string' && metadataAvatarUrl.trim() ? metadataAvatarUrl : null
  const canUseGoogleAvatar = !!googleAvatarUrl && googleAvatarUrl !== profile?.avatar_url
  const usingUploadedAvatar = isBucketImagePath(profile?.avatar_url)
  const avatarDescription = !profile?.avatar_url
    ? 'No picture yet — showing your initial.'
    : usingUploadedAvatar
      ? 'Using your uploaded picture.'
      : profile?.avatar_url === googleAvatarUrl
        ? 'Currently using your Google account picture.'
        : 'Using your current account picture.'
  const avatarControlDisabled = uploading || isResettingAvatar || !uploadEnabled || settingsLoading

  // Analytics consent can be changed here after the first-run banner; the
  // control only exists when the operator configured a measurement ID.
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => hasAnalyticsConsent())
  const handleAnalyticsConsent = (allowed: boolean) => {
    setAnalyticsAllowed(allowed)
    if (allowed) {
      setAnalyticsConsent('granted')
      initAnalytics()
      trackPageView(window.location.pathname)
    } else {
      setAnalyticsConsent('denied')
      disableAnalytics()
    }
    addToast(allowed ? 'Usage analytics turned on.' : 'Usage analytics turned off.', 'success')
  }

  // Consent checkbox persists immediately (not on the form's Save button):
  // unchecking must take effect as soon as the user flips it.
  const handleEmailOptIn = async (checked: boolean) => {
    if (!user) return
    const { error } = await updateEmailOptIn(user.id, checked)
    if (error) {
      console.error('Error updating email opt-in:', error)
      addToast('Failed to update your email preference. Please try again.', 'error')
      return
    }
    await refreshProfile()
    addToast(
      checked ? "You're signed up for email updates." : 'Email updates turned off.',
      'success'
    )
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const path = await uploadAvatar(file)
      if (path) addToast('Profile picture updated.', 'success')
    } catch (error) {
      console.error('Error updating profile picture:', error)
      addToast(error instanceof Error ? error.message : 'Failed to update your profile picture. Please try again.', 'error')
    }
  }

  const handleGoogleAvatar = async () => {
    if (!user || !googleAvatarUrl || isResettingAvatar) return
    setIsResettingAvatar(true)
    try {
      const { error } = await updateAvatarUrl(user.id, googleAvatarUrl)
      if (error) throw error
      await refreshProfile()
      addToast('Profile picture updated.', 'success')
    } catch (error) {
      console.error('Error restoring Google picture:', error)
      addToast('Failed to restore your Google picture. Please try again.', 'error')
    } finally {
      setIsResettingAvatar(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSaving(true)

    try {
      const { error } = await updateDisplayName(user.id, displayName)

      if (error) throw error

      // Re-sync the context profile so other consumers (e.g. the lobby header)
      // see the new display name immediately (ARCH-4).
      await refreshProfile()

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
    } catch (err) {
      console.error('Push notification error:', err)
      addToast('Failed to update push notification settings. Please try again.', 'error')
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
      const { error } = await deleteAccount()
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
        <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-8">Profile Settings</h2>
        
        <div className="bg-white dark:bg-surface-800 shadow rounded-lg p-6">
          <div className="flex items-center space-x-6 mb-8">
            <div className="relative inline-block shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarControlDisabled}
                aria-label="Change profile picture"
                aria-busy={uploading}
                className="group relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
              >
                {profile.avatar_url ? (
                  <Avatar
                    className="h-24 w-24 object-cover rounded-full shadow-sm"
                    src={profile.avatar_url}
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-500 dark:text-primary-400 shadow-sm">
                    <span className="text-3xl font-medium">
                      {displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm ring-2 ring-white dark:ring-surface-800 group-hover:bg-primary-700"
                >
                  {uploading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  )}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                tabIndex={-1}
                onChange={handleAvatarUpload}
                className="sr-only"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-medium text-surface-900 dark:text-surface-100">Your Avatar</h3>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                {avatarDescription}
              </p>
              {settingsLoading ? (
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Checking upload availability.</p>
              ) : !uploadEnabled ? (
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Image uploads are turned off by the server admin.</p>
              ) : null}
              {canUseGoogleAvatar && (
                <button
                  type="button"
                  onClick={handleGoogleAvatar}
                  disabled={isResettingAvatar}
                  className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResettingAvatar ? 'Restoring...' : 'Use Google picture'}
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                disabled
                value={user?.email || ''}
                className="mt-1 block w-full rounded-md border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-surface-500 dark:text-surface-400 px-3 py-2 border"
              />
              <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">Your email is managed by your Google account.</p>
            </div>

            <div className="flex items-start">
              <div className="flex h-5 items-center">
                <input
                  id="email_opt_in"
                  type="checkbox"
                  checked={emailOptIn}
                  onChange={(e) => handleEmailOptIn(e.target.checked)}
                  className="h-4 w-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 dark:text-primary-400 focus:ring-primary-500"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="email_opt_in" className="font-medium text-surface-700 dark:text-surface-300">
                  Email me about Role by Post — product updates, beta invitations, and replies to my feedback or reports
                </label>
                <p className="text-surface-500 dark:text-surface-400">
                  Off by default; turn off anytime here. See the{' '}
                  <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">Privacy Policy</Link>.
                </p>
              </div>
            </div>

            {env.VITE_GA_MEASUREMENT_ID && (
              <div className="flex items-start">
                <div className="flex h-5 items-center">
                  <input
                    id="analytics_consent"
                    type="checkbox"
                    checked={analyticsAllowed}
                    onChange={(e) => handleAnalyticsConsent(e.target.checked)}
                    className="h-4 w-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 dark:text-primary-400 focus:ring-primary-500"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="analytics_consent" className="font-medium text-surface-700 dark:text-surface-300">
                    Allow usage analytics
                  </label>
                  <p className="text-surface-500 dark:text-surface-400">
                    Off until you allow it; turn it off anytime here. See the{' '}
                    <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">Privacy Policy</Link>.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                Display Name
              </label>
              <input
                type="text"
                id="displayName"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="bg-white dark:bg-surface-800 mt-1 block w-full rounded-md border-surface-300 dark:border-surface-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3 py-2 border"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSaving || !displayName.trim()}
                className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-surface-900 dark:text-surface-100 mb-4">Notifications</h3>
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
                    <h4 className="text-sm font-medium text-surface-900 dark:text-surface-100">Push Notifications on this device</h4>
                    <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
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
              </div>

              {/* Notification Preferences - Account wide */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-surface-900 dark:text-surface-100">Notification Types</h4>
                
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
                    <label htmlFor="badge_enabled" className="font-medium text-surface-700 dark:text-surface-300">Show Unread Badges</label>
                    <p className="text-surface-500 dark:text-surface-400">Show a red dot on channels with unread messages.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-surface-900 dark:text-surface-100 mb-4">Account &amp; Data</h3>
        <div className="bg-white dark:bg-surface-800 shadow rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-surface-900 dark:text-surface-100">Download My Data</h4>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                Export your profile, channel memberships, and authored messages as a JSON file.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 py-2 px-4 text-sm font-medium text-surface-700 dark:text-surface-300 shadow-sm hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isExporting ? 'Exporting...' : 'Download My Data'}
            </button>
          </div>

          <div className="border-t border-surface-200 dark:border-surface-700 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-red-600 dark:text-red-400">Delete Account</h4>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
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

          <div className="text-sm text-surface-500 dark:text-surface-400">
            See the{' '}
            <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 font-medium">
              Privacy Policy
            </Link>{' '}
            for details on what data we store and how you can exercise your rights.
          </div>
        </div>
      </div>

      {showDeleteConfirm && <DeleteConfirmDialog onCancel={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} isDeleting={isDeleting} deleteConfirmText={deleteConfirmText} setDeleteConfirmText={setDeleteConfirmText} />}
    </div>
  )
}

interface DeleteConfirmDialogProps {
  onCancel: () => void
  onConfirm: () => void
  isDeleting: boolean
  deleteConfirmText: string
  setDeleteConfirmText: (value: string) => void
}

function DeleteConfirmDialog({ onCancel, onConfirm, isDeleting, deleteConfirmText, setDeleteConfirmText }: DeleteConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onCancel)
  useFocusTrap(dialogRef)

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-surface-500 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80" aria-hidden="true" onClick={onCancel}></div>
        <div className="relative bg-white dark:bg-surface-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 id="delete-account-title" className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-2">
            Delete your account?
          </h3>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
            This action is permanent and cannot be undone. Type <span className="font-semibold">DELETE</span> to confirm.
          </p>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
            className="bg-white dark:bg-surface-800 mt-1 block w-full rounded-md border-surface-300 dark:border-surface-600 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm px-3 py-2 border"
          />
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 py-2 px-4 text-sm font-medium text-surface-700 dark:text-surface-300 shadow-sm hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleteConfirmText !== 'DELETE' || isDeleting}
              className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isDeleting ? 'Deleting...' : 'Permanently Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
