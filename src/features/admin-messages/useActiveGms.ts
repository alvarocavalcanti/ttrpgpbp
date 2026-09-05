import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { ProfileRowSchema, parseRow } from '../validation/rowSchemas'

export type ActiveGm = { id: string, display_name: string }

// Loads the active GMs for the server admin's "New Message" picker. Rows are
// validated with the shared profile schema instead of trusted blindly; a
// failed load surfaces as an error the modal renders with a Retry button.
export function useActiveGms(enabled: boolean) {
  const [gms, setGms] = useState<ActiveGm[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  const fetchGms = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_active_gms')
      if (rpcError) {
        setError(new Error(rpcError.message))
      } else {
        const rows = (data ?? []).flatMap(row => {
          const parsed = parseRow(ProfileRowSchema, row)
          // The picker needs a label; skip rows without a display name.
          return parsed?.display_name ? [{ id: parsed.id, display_name: parsed.display_name }] : []
        })
        setGms(rows)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load GMs'))
    }
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void fetchGms()
  }, [fetchGms])

  return { gms, loading, error, refetch: fetchGms }
}
