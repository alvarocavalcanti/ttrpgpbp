import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseRow, AnonPublicChannelRowSchema, type AnonPublicChannel } from '../validation/rowSchemas'

// Page size for the public directory. Matches the signed-in Discover list.
const PAGE_SIZE = 20

function toRows(data: unknown): AnonPublicChannel[] {
  if (!Array.isArray(data)) return []
  return data
    .map((row) => parseRow(AnonPublicChannelRowSchema, row))
    .filter((row): row is AnonPublicChannel => row !== null)
}

// Data layer for the anonymous /directory (#674): list_public_channels_anon,
// offset pagination, and nothing else — there is no search or filter on the
// public page, so the query identity never changes.
//
// shortcut: this is deliberately kept separate from usePublicChannels (the
// signed-in Discover list) rather than sharing a pagination hook, so the merged
// hook stays untouched. If a third offset-paginated list appears, or the two
// drift, extract the shared first-page/loadMore/generation mechanics.
export function usePublicChannelsAnon({ enabled = true }: { enabled?: boolean } = {}) {
  const [channels, setChannels] = useState<AnonPublicChannel[]>([])
  const [loading, setLoading] = useState(enabled)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // A failed "Load more" keeps the rows already on screen; the page renders it
  // as an inline row instead of replacing the list.
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(false)
  // Bumped by refetch() to re-run the first-page effect (error-state Retry).
  const [refetchKey, setRefetchKey] = useState(0)
  // Invalidate an in-flight page when a retry replaces the list underneath it.
  const generationRef = useRef(0)
  // loadMore reentry guard — the button only disables after a re-render.
  const loadingMoreRef = useRef(false)

  const refetch = useCallback(() => {
    setError(null)
    setLoadMoreError(null)
    setLoading(true)
    setRefetchKey((key) => key + 1)
  }, [])

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current

    if (!enabled) {
      // The prerender pass renders the shell only: the list is fetched by the
      // client, so the snapshot must not bake a spinner, an error, or a stale
      // page of listings into the static HTML.
      setChannels([])
      setLoading(false)
      setError(null)
      setLoadMoreError(null)
      setHasMore(false)
      return
    }

    let mounted = true
    setLoading(true)
    setError(null)
    setLoadMoreError(null)

    async function fetchFirstPage() {
      const { data, error: rpcError } = await supabase.rpc('list_public_channels_anon', {
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
  }, [enabled, refetchKey])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    const generation = generationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('list_public_channels_anon', {
        p_limit: PAGE_SIZE,
        p_offset: channels.length,
      })
      // A retry replaced the list while this page was in flight: drop it rather
      // than append rows from the previous result set.
      if (generation !== generationRef.current) return
      if (rpcError) {
        setLoadMoreError(rpcError)
        return
      }
      const rows = toRows(data)
      setChannels((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE_SIZE)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [channels.length])

  return { channels, loading, loadingMore, error, loadMoreError, hasMore, refetch, loadMore }
}
