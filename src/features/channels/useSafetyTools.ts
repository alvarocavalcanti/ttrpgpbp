import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type SafetyTools = Database['public']['Tables']['channel_safety_tools']['Row']

// Shared fetch/upsert for the Lines & Veils channel safety tools row.
// `enabled` lets callers defer the fetch (e.g. until the Safety tab opens).
//
// `loaded` reports a *successful* read — a row or no row at all. Callers that
// write safety fields back must gate on it: while the read is pending or after
// it failed, the in-memory values are unknown, and sending them would overwrite
// the stored text with blanks.
export function useSafetyTools(channelId: string | undefined, enabled = true) {
  const [safetyTools, setSafetyTools] = useState<SafetyTools | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    if (!channelId || !enabled) {
      setLoading(false)
      return
    }
    const cid = channelId
    setLoading(true)

    async function fetchSafetyTools() {
      const { data, error } = await supabase
        .from('channel_safety_tools')
        .select('*')
        .eq('channel_id', cid)
        .maybeSingle()
      if (error) {
        console.error('Failed to fetch safety tools:', error)
      } else if (mounted) {
        setSafetyTools(data)
        setLoaded(true)
      }
      if (mounted) setLoading(false)
    }

    fetchSafetyTools()
    return () => { mounted = false }
  }, [channelId, enabled])

  return { safetyTools, loading, loaded }
}
