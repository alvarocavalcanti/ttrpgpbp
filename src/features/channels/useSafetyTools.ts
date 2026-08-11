import { useState, useEffect, useCallback } from 'react'
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

  const saveSafetyTools = useCallback(async (lines: string, veils: string): Promise<boolean> => {
    if (!channelId) return false
    const { error } = await supabase
      .from('channel_safety_tools')
      .upsert({ channel_id: channelId, lines, veils, updated_at: new Date().toISOString() })
    if (error) {
      console.error('Failed to save safety tools:', error)
      return false
    }
    setSafetyTools({ channel_id: channelId, lines, veils, updated_at: new Date().toISOString() })
    return true
  }, [channelId])

  return { safetyTools, loading, saveSafetyTools }
}
