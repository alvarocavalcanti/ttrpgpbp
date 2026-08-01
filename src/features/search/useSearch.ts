import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useDebounce } from '../../hooks/useDebounce'

type Message = Database['public']['Tables']['messages']['Row'] & {
  sender?: { display_name: string | null; avatar_url: string | null } | null
}

export function useSearch(channelId: string) {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedTerm = useDebounce(searchTerm, 300)
  
  const [results, setResults] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchResults() {
      if (!debouncedTerm.trim()) {
        if (mounted) {
          setResults([])
          setLoading(false)
        }
        return
      }

      if (mounted) setLoading(true)
      
      try {
        const { data, error: searchError } = await supabase
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(display_name, avatar_url)')
          .eq('channel_id', channelId)
          .textSearch('search_vector', debouncedTerm, { type: 'websearch', config: 'english' })
          .order('created_at', { ascending: false })
          .limit(20)

        if (searchError) throw searchError
        
        const normalizedData = (data || []).map(msg => ({
          ...msg,
          sender: Array.isArray(msg.sender) ? msg.sender[0] : msg.sender
        }))

        if (mounted) {
          setResults(normalizedData)
          setError(null)
        }
      } catch (err: any) {
        console.error('Search error:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchResults()

    return () => {
      mounted = false
    }
  }, [debouncedTerm, channelId])

  return {
    searchTerm,
    setSearchTerm,
    results,
    loading,
    error
  }
}
