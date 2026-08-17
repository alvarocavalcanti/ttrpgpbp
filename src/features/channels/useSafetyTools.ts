import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type SafetyTools = Database['public']['Tables']['channel_safety_tools']['Row']

// Shared fetch/upsert for the Lines & Veils channel safety tools row.
// `enabled` lets callers defer the fetch (e.g. until a collapsible section opens).
export function useSafetyTools(channelId: string | undefined, enabled = true) {
  const [safetyTools, setSafetyTools] = useState<SafetyTools | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    if (!channelId || !enabled) {
      setLoading(false)
      return
    }
    const cid = channelId

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
      }
      if (mounted) setLoading(false)
    }

    fetchSafetyTools()
    return () => { mounted = false }
  }, [channelId, enabled])

  return { safetyTools, loading }
}
