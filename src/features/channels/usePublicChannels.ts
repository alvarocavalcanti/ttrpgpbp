import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseRow, PublicChannelRowSchema, type PublicChannel } from '../validation/rowSchemas'

// Page size for the Discover list. Matches the RPC's own default and stays
// well under its hard cap (100) so a page is always cheap.
const PAGE_SIZE = 20

interface UsePublicChannelsOptions {
  /** Free-text search, applied server-side over name + description. */
  search?: string
  /** Game-system filter; '' / undefined means "all systems". */
  gameSystem?: string
  /** Skip the query entirely (e.g. while the My Games tab is showing). */
  enabled?: boolean
}

function toRows(data: unknown): PublicChannel[] {
  if (!Array.isArray(data)) return []
  return data
    .map((row) => parseRow(PublicChannelRowSchema, row))
    .filter((row): row is PublicChannel => row !== null)
}

// Data layer for the Discover tab (#674): the list_public_channels RPC, its
// search/filter params, and offset pagination. Mirrors useChannels' state shape
// (loading / error / refetch) so the Lobby can render both tabs the same way.
export function usePublicChannels({ search = '', gameSystem = '', enabled = true }: UsePublicChannelsOptions = {}) {
  const [channels, setChannels] = useState<PublicChannel[]>([])
  const [loading, setLoading] = useState(enabled)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(false)
  // Bumped by refetch() to re-run the first-page effect (error-state Retry).
  const [refetchKey, setRefetchKey] = useState(0)
  // Query generation: bumped whenever the query identity changes (search,
  // filter, enabled) so a page fetched for an older query can be discarded
  // instead of appended to a list it no longer belongs to.
  const generationRef = useRef(0)
  // loadMore reentry guard — the button only disables after a re-render.
  const loadingMoreRef = useRef(false)

  const refetch = useCallback(() => {
    setError(null)
    setLoading(true)
    setRefetchKey((key) => key + 1)
  }, [])

  useEffect(() => {
    // Invalidate any in-flight page: its rows belong to the previous query.
    generationRef.current += 1
    const generation = generationRef.current

    if (!enabled) {
      setChannels([])
      setLoading(false)
      setError(null)
      setHasMore(false)
      return
    }

    let mounted = true
    setLoading(true)
    setError(null)

    async function fetchFirstPage() {
      const { data, error: rpcError } = await supabase.rpc('list_public_channels', {
        p_search: search || undefined,
        p_game_system: gameSystem || undefined,
        p_limit: PAGE_SIZE,
        p_offset: 0,
      })
      if (!mounted || generation !== generationRef.current) return
      if (rpcError) {
        setError(rpcError)
        setLoading(false)
        return
      }
      const rows = toRows(data)
      setChannels(rows)
      // A full page means there may be more; a short page is the last one.
      setHasMore(rows.length === PAGE_SIZE)
      setLoading(false)
    }

    void fetchFirstPage()
    return () => {
      mounted = false
    }
  }, [enabled, search, gameSystem, refetchKey])

  const loadMore = useCallback(async () => {
    // The button only disables after a re-render, so guard reentry here.
    if (loadingMoreRef.current) return
    const generation = generationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('list_public_channels', {
        p_search: search || undefined,
        p_game_system: gameSystem || undefined,
        p_limit: PAGE_SIZE,
        p_offset: channels.length,
      })
      // A newer query started while this page was in flight: drop it rather than
      // append rows from a result set that no longer matches.
      if (generation !== generationRef.current) return
      if (rpcError) {
        setError(rpcError)
        return
      }
      const rows = toRows(data)
      setChannels((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE_SIZE)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [channels.length, search, gameSystem])

  return { channels, loading, loadingMore, error, hasMore, refetch, loadMore }
}
