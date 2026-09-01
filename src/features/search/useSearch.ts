import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useDebounce } from '../../hooks/useDebounce'
import { toError } from '../../lib/errors'
import { SearchMessageRowSchema, normalizeProfileRef, parseRow } from '../validation/rowSchemas'

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
    const controller = new AbortController()
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
          .eq('is_deleted', false)
          .textSearch('search_vector', debouncedTerm, { type: 'websearch', config: 'english' })
          .order('created_at', { ascending: false })
          .limit(20)
          .abortSignal(controller.signal)

        if (searchError) throw searchError
        
        const normalizedData = (data || []).flatMap(msg => {
          const row = parseRow(SearchMessageRowSchema, msg)
          if (!row) return [] // malformed row — drop it from the results
          return [{ ...msg, ...row, sender: normalizeProfileRef(msg.sender) } as Message]
        })

        if (mounted) {
          setResults(normalizedData as Message[])
          setError(null)
        }
      } catch (err) {
        // Aborting an in-flight request on a new keystroke is not an error.
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('Search error:', err)
        if (mounted) setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchResults()

    return () => {
      mounted = false
      controller.abort()
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
