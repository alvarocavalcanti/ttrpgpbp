import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../../lib/supabase'
import { usePushNotifications } from './usePushNotifications'
import { useToast } from '../../contexts/ToastContext'

export function ProfileSettings() {
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)

  const {
    isSupported,
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

  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Profile Settings</h2>
        
        <div className="bg-white shadow rounded-lg p-6">
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
                <div className="h-24 w-24 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
                  <span className="text-3xl font-medium">
                    {displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Your Avatar</h3>
              <p className="text-sm text-gray-500 mt-1">
                Currently using your Google account picture.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                disabled
                value={profile.email || user?.email || ''}
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-500 px-3 py-2 border"
              />
              <p className="mt-1 text-xs text-gray-500">Your email is managed by your Google account.</p>
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                Display Name
              </label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
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
        <h3 className="text-xl font-bold text-gray-900 mb-4">Notifications</h3>
        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          {prefsLoading ? (
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ) : (
            <>
              {/* Push Subscriptions - Device specific */}
              <div className="border-b border-gray-200 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Push Notifications on this device</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      {!isConfigured
                        ? 'Push notifications are not configured on the server.'
                        : isSupported 
                          ? 'Receive notifications even when the app is closed.'
                          : 'Push notifications are not supported on this browser/device.'}
                    </p>
                    {isConfigured && isSupported && permission === 'denied' && (
                      <p className="text-sm text-red-500 mt-1">
                        You have blocked notifications. You must allow them in your browser settings.
                      </p>
                    )}
                  </div>
                  {isConfigured && isSupported && (
                    <button
                      type="button"
                      onClick={togglePushSubscription}
                      disabled={permission === 'denied'}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isSubscribed ? 'bg-indigo-600' : 'bg-gray-200'}`}
                      role="switch"
                      aria-checked={isSubscribed}
                    >
                      <span className="sr-only">Use push notifications</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSubscribed ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Notification Preferences - Account wide */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900">Notification Types</h4>
                
                <div className="flex items-start">
                  <div className="flex h-5 items-center">
                    <input
                      id="push_enabled"
                      type="checkbox"
                      checked={preferences?.push_enabled ?? false}
                      onChange={(e) => updatePreferences({ push_enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="push_enabled" className="font-medium text-gray-700">Send me Push Notifications</label>
                    <p className="text-gray-500">Global toggle for push notifications across all devices.</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="flex h-5 items-center">
                    <input
                      id="badge_enabled"
                      type="checkbox"
                      checked={preferences?.badge_enabled ?? false}
                      onChange={(e) => updatePreferences({ badge_enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="badge_enabled" className="font-medium text-gray-700">Show Unread Badges</label>
                    <p className="text-gray-500">Show a red dot on channels with unread messages.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

