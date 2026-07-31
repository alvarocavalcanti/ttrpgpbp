import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { hashPassword } from '../../lib/crypto'

interface CreateChannelModalProps {
  onClose: () => void
}

export function CreateChannelModal({ onClose }: CreateChannelModalProps) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [password, setPassword] = useState('')
  const [characterName, setCharacterName] = useState(profile?.display_name || '')
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    setIsSubmitting(true)
    setError(null)

    try {
      const passwordHash = password ? await hashPassword(password) : null
      const inviteCode = crypto.randomUUID().split('-')[0] // Simple 8-char invite code
      
      // 1. Create the channel
      const { data: channel, error: channelError } = await supabase
        .from('channels')
        .insert({
          name,
          gm_id: user.id,
          is_public: isPublic,
          invite_code: inviteCode
        })
        .select()
        .single()

      if (channelError) throw channelError
      if (!channel) throw new Error('Failed to create channel')

      // 1.5 Create the channel_secrets row if a password is set
      if (passwordHash) {
        const { error: secretsError } = await supabase
          .from('channel_secrets')
          .insert({
            channel_id: channel.id,
            password_hash: passwordHash
          })
        if (secretsError) throw secretsError
      }

      // 2. Join the channel using RPC
      const { error: rpcError } = await supabase.rpc('join_channel', {
        p_channel_id: channel.id,
        p_character_name: characterName,
        p_password_hash: passwordHash || undefined, // GM joining their own channel
      })
      
      if (rpcError) throw rpcError

      onClose()
      navigate(`/channel/${channel.id}`)
      
    } catch (err: any) {
      console.error('Error creating channel:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
              Create a New Channel
            </h3>
            
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Channel Name</label>
                <input
                  type="text"
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="e.g. Curse of Strahd"
                />
              </div>

              <div>
                <label htmlFor="characterName" className="block text-sm font-medium text-gray-700">Your GM Name</label>
                <input
                  type="text"
                  id="characterName"
                  required
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="e.g. The DM"
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
                  <p className="text-gray-500">List this channel in the public lobby.</p>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password (Optional)
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="Leave blank for open access"
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
                  disabled={isSubmitting || !name.trim() || !characterName.trim()}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
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
