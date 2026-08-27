import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type Npc = Database['public']['Tables']['channel_npcs']['Row']

export function useChannelNpcs(channelId: string | undefined) {
  const [npcs, setNpcs] = useState<Npc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchNpcs = useCallback(async (mounted: { current: boolean }) => {
    if (!channelId) {
      if (mounted.current) setLoading(false)
      return
    }
    if (mounted.current) setError(null)
    const { data, error: fetchError } = await supabase
      .from('channel_npcs')
      .select('*')
      .eq('channel_id', channelId)
      .order('name', { ascending: true })
    if (fetchError) {
      console.error('Failed to fetch channel NPCs:', fetchError)
      if (mounted.current) setError(fetchError)
    } else if (mounted.current) {
      setNpcs(data || [])
    }
    if (mounted.current) setLoading(false)
  }, [channelId])

  useEffect(() => {
    const mounted = { current: true }
    setLoading(true)
    void fetchNpcs(mounted)
    return () => { mounted.current = false }
  }, [fetchNpcs])

  const refetch = useCallback(() => {
    const mounted = { current: true }
    void fetchNpcs(mounted)
  }, [fetchNpcs])

  const addNpc = useCallback((npc: Npc) => {
    setNpcs(prev => prev.some(n => n.name.toLowerCase() === npc.name.toLowerCase())
      ? prev
      : [...prev, npc].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  // Creates (or reuses, on a name collision) an NPC and refreshes the roster.
  const createNpc = useCallback(async (name: string, avatarUrl: string): Promise<boolean> => {
    if (!channelId) return false
    // ignoreDuplicates keeps a concurrently-created same-name NPC's row intact,
    // mirroring the composer's upsert against the (channel_id, name) unique.
    const { error } = await supabase
      .from('channel_npcs')
      .upsert(
        { channel_id: channelId, name, avatar_url: avatarUrl },
        { onConflict: 'channel_id,name', ignoreDuplicates: true }
      )
    if (error) {
      console.error('Failed to create channel NPC:', error)
      return false
    }
    refetch()
    return true
  }, [channelId, refetch])

  const renameNpc = useCallback(async (id: string, name: string): Promise<boolean> => {
    const { error } = await supabase
      .from('channel_npcs')
      .update({ name })
      .eq('id', id)
    if (error) {
      console.error('Failed to rename channel NPC:', error)
      return false
    }
    refetch()
    return true
  }, [refetch])

  const repictureNpc = useCallback(async (id: string, avatarUrl: string): Promise<boolean> => {
    const { error } = await supabase
      .from('channel_npcs')
      .update({ avatar_url: avatarUrl })
      .eq('id', id)
    if (error) {
      console.error('Failed to repicture channel NPC:', error)
      return false
    }
    refetch()
    return true
  }, [refetch])

  const deleteNpc = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('channel_npcs')
      .delete()
      .eq('id', id)
    if (error) {
      console.error('Failed to delete channel NPC:', error)
      return false
    }
    refetch()
    return true
  }, [refetch])

  return { npcs, loading, error, refetch, addNpc, createNpc, renameNpc, repictureNpc, deleteNpc }
}
