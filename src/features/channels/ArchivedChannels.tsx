import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import type { Database } from '../../types/database'

type Channel = Database['public']['Tables']['channels']['Row']

export function ArchivedChannels() {
  const { user } = useAuth()
  const [archivedChannels, setArchivedChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [errorState, setErrorState] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchArchived() {
      if (!user) return
      try {
        const { data, error } = await supabase
          .from('channels')
          .select('*')
          .eq('gm_id', user.id)
          .eq('is_archived', true)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (mounted) setArchivedChannels(data || [])
      } catch (err) {
        console.error('Error fetching archived channels:', err)
        if (mounted) setErrorState('Failed to load archived channels.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchArchived()
    return () => { mounted = false }
  }, [user])

  const handleRestore = async (id: string) => {
    setErrorState(null)
    try {
      const { error } = await supabase
        .from('channels')
        .update({ is_archived: false })
        .eq('id', id)
      
      if (error) throw error
      setArchivedChannels(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      console.error('Failed to restore channel', err)
      setErrorState('Failed to restore channel.')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-6 lg:px-8">
      <div className="flex items-center space-x-4 mb-6">
        <Link to="/" className="text-gray-500 hover:text-indigo-600 transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Archived Channels</h2>
      </div>

      {errorState && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
          {errorState}
        </div>
      )}

      <div className="bg-white shadow overflow-hidden rounded-md">
        {archivedChannels.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No archived channels found.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {archivedChannels.map(channel => (
              <li key={channel.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{channel.name}</h3>
                  <p className="text-sm text-gray-500">Created on {new Date(channel.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <button
                    onClick={() => handleRestore(channel.id)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
