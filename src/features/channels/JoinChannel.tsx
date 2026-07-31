import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { hashPassword } from '../../lib/crypto'
import type { Database } from '../../types/database'

type Channel = Database['public']['Tables']['channels']['Row']

export function JoinChannel() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('code')
  
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  
  const [channel, setChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [characterName, setCharacterName] = useState(profile?.display_name || '')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchChannel() {
      if (!id) return
      try {
        const { data, error } = await supabase
          .from('channels')
          .select('*')
          .eq('id', id)
          .single()
          
        if (error) throw error
        setChannel(data)
      } catch (err: any) {
        console.error('Error fetching channel to join:', err)
        setError('Channel not found.')
      } finally {
        setLoading(false)
      }
    }
    fetchChannel()
  }, [id])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !user) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const passwordHash = password ? await hashPassword(password) : undefined
      
      const { error: rpcError } = await supabase.rpc('join_channel', {
        p_channel_id: id,
        p_character_name: characterName,
        p_password_hash: passwordHash,
        p_invite_code: inviteCode || undefined
      })
      
      if (rpcError) throw rpcError
      
      navigate(`/channel/${id}`)
    } catch (err: any) {
      console.error('Error joining channel:', err)
      setError(err.message || 'Failed to join channel. Invalid password or invite code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-lg shadow-sm text-center">
        <h2 className="text-xl font-medium text-gray-900 mb-2">Channel Not Found</h2>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Return to Lobby
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-12 px-4 sm:px-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Join Channel</h2>
          <p className="text-indigo-600 font-medium mt-2 text-lg">{channel.name}</p>
        </div>
        
        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="characterName" className="block text-sm font-medium text-gray-700">
              Character Name
            </label>
            <input
              type="text"
              id="characterName"
              required
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
              placeholder="Who will you play as?"
            />
          </div>

          {channel.has_password && !inviteCode && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Channel Password
              </label>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
              />
            </div>
          )}
          
          {inviteCode && (
            <div className="bg-green-50 text-green-800 p-3 rounded-md text-sm text-center">
              You are joining with a valid invite link.
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex flex-col space-y-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !characterName.trim() || (!!channel.has_password && !inviteCode && !password)}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Joining...' : 'Join Campaign'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
