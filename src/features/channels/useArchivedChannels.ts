import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import type { Database } from '../../types/database'

type Channel = Database['public']['Tables']['channels']['Row']

// Data layer for the archived-channels page (ARCH-1): the GM's archived
// channels query and the restore mutation live here; the page renders.
export function useArchivedChannels() {
  const { user } = useAuth()
  const [archivedChannels, setArchivedChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchArchived() {
      if (!user) return
      try {
        const { data, error: fetchError } = await supabase
          .from('channels')
          .select('*')
          .eq('gm_id', user.id)
          .eq('is_archived', true)
          .order('created_at', { ascending: false })

        if (fetchError) throw fetchError
        if (mounted) setArchivedChannels(data || [])
      } catch (err) {
        console.error('Error fetching archived channels:', err)
        if (mounted) setError('Failed to load archived channels.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchArchived()
    return () => { mounted = false }
  }, [user])

  const restoreChannel = async (id: string): Promise<boolean> => {
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('channels')
        .update({ is_archived: false })
        .eq('id', id)

      if (updateError) throw updateError
      setArchivedChannels(prev => prev.filter(c => c.id !== id))
      return true
    } catch (err) {
      console.error('Failed to restore channel', err)
      setError('Failed to restore channel.')
      return false
    }
  }

  return { archivedChannels, loading, error, restoreChannel }
}
