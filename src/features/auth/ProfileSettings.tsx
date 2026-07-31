import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../../lib/supabase'

export function ProfileSettings() {
  const { user, profile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name)
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id)

      if (error) throw error

      setSaveMessage({ type: 'success', text: 'Profile updated successfully.' })
    } catch (error) {
      console.error('Error updating profile:', error)
      setSaveMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
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

          {saveMessage && (
            <div className={`p-4 rounded-md ${saveMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <p className="text-sm">{saveMessage.text}</p>
            </div>
          )}

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
  )
}
