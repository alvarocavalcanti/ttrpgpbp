import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type Npc = Database['public']['Tables']['channel_npcs']['Row']

export function useChannelNpcs(channelId: string | undefined) {
  const [npcs, setNpcs] = useState<Npc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    if (!channelId) {
      setLoading(false)
      return
    }
    const cid = channelId

    async function fetchNpcs() {
      const { data, error } = await supabase
        .from('channel_npcs')
        .select('*')
        .eq('channel_id', cid)
        .order('name', { ascending: true })
      if (error) {
        console.error('Failed to fetch channel NPCs:', error)
      } else if (mounted) {
        setNpcs(data || [])
      }
      if (mounted) setLoading(false)
    }

    fetchNpcs()
    return () => { mounted = false }
  }, [channelId])

  const addNpc = useCallback((npc: Npc) => {
    setNpcs(prev => prev.some(n => n.name.toLowerCase() === npc.name.toLowerCase())
      ? prev
      : [...prev, npc].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  return { npcs, loading, addNpc }
}
