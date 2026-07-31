import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { hashPassword } from '../../lib/crypto'

type Channel = Database['public']['Tables']['channels']['Row']

interface ChannelSettingsProps {
  channel: Channel
  onClose: () => void
  onUpdate: () => void
}

export function ChannelSettings({ channel, onClose, onUpdate }: ChannelSettingsProps) {
  const [name, setName] = useState(channel.name)
  const [isPublic, setIsPublic] = useState(channel.is_public)
  const [mapUrl, setMapUrl] = useState(channel.map_url || '')
  const [resourcesUrl, setResourcesUrl] = useState(channel.resources_url || '')
  
  // Changing password logic
  const [changePassword, setChangePassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const updates: any = {
        name,
        is_public: isPublic,
        map_url: mapUrl || null,
        resources_url: resourcesUrl || null
      }

      const { error: updateError } = await supabase
        .from('channels')
        .update(updates)
        .eq('id', channel.id)

      if (updateError) throw updateError

      if (changePassword) {
        const passwordHash = newPassword ? await hashPassword(newPassword) : null
        
        // Try to update first
        const { data: updateData, error: secretUpdateError } = await supabase
          .from('channel_secrets')
          .update({ password_hash: passwordHash })
          .eq('channel_id', channel.id)
          .select()

        // If no row existed, we need to insert it
        if (!updateData || updateData.length === 0) {
          const { error: insertError } = await supabase
            .from('channel_secrets')
            .insert({ channel_id: channel.id, password_hash: passwordHash })
            
          if (insertError) throw insertError
        } else if (secretUpdateError) {
           throw secretUpdateError
        }
      }
      
      onUpdate()
      onClose()
    } catch (err: any) {
      console.error('Error updating channel:', err)
      setError('Failed to update channel settings.')
      setIsSubmitting(false)
    }
  }

  const inviteLink = `${window.location.origin}/join/${channel.id}?code=${channel.invite_code}`

  return (
    <div className="fixed z-20 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
              Channel Settings
            </h3>
            
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Invite Link</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md sm:text-sm border-gray-300 bg-gray-50 text-gray-500 border"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 sm:text-sm hover:bg-gray-100"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Channel Name</label>
                <input
                  type="text"
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>

              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="isPublic"
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="isPublic" className="font-medium text-gray-700">Public Channel</label>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Channel Password
                  </label>
                  {!changePassword && (
                    <button
                      type="button"
                      onClick={() => setChangePassword(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Change Password
                    </button>
                  )}
                </div>
                {changePassword ? (
                  <input
                    type="text"
                    id="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                    placeholder="Leave blank to remove password"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-500 italic">
                    {channel.has_password ? 'Password is set (hidden)' : 'No password currently set'}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="mapUrl" className="block text-sm font-medium text-gray-700">Map URL</label>
                <input
                  type="url"
                  id="mapUrl"
                  value={mapUrl}
                  onChange={(e) => setMapUrl(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="https://owlbear.rodeo/..."
                />
              </div>

              <div>
                <label htmlFor="resourcesUrl" className="block text-sm font-medium text-gray-700">Resources URL</label>
                <input
                  type="url"
                  id="resourcesUrl"
                  value={resourcesUrl}
                  onChange={(e) => setResourcesUrl(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="https://drive.google.com/..."
                />
              </div>

              {error && (
                <div className="text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
