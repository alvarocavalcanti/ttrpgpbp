import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseRow, PlatformStatsRowSchema, type PlatformStatsRow } from '../features/validation/rowSchemas'

// The platform figures both public surfaces show (#808). Snake_case from the
// RPC, camelCase here, because the components read them as words.
export interface PlatformStats {
  games: number
  messages: number
  members: number
  activeGames: number
  recruitingGames: number
  newGamesWeek: number
}

function toStats(row: PlatformStatsRow): PlatformStats {
  return {
    games: row.games,
    messages: row.messages,
    members: row.members,
    activeGames: row.active_games,
    recruitingGames: row.recruiting_games,
    newGamesWeek: row.new_games_week,
  }
}

// One role-agnostic RPC, one hook: /directory and the Discover tab read the same
// cached row, so the two surfaces cannot disagree.
//
// Every failure collapses to `stats: null` with no error state. The band is
// decoration — the listings are the product — so a failed stats fetch drops the
// band silently instead of showing an error or replacing anything.
export function usePlatformStats({ enabled = true }: { enabled?: boolean } = {}) {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled) {
      setStats(null)
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    async function fetchStats() {
      try {
        const { data, error } = await supabase.rpc('get_platform_stats')
        if (!mounted) return
        if (error || !Array.isArray(data) || data.length === 0) {
          setStats(null)
          return
        }
        const row = parseRow(PlatformStatsRowSchema, data[0])
        setStats(row ? toStats(row) : null)
      } catch {
        // Network down: the band is decoration, so there is nothing to report.
        if (mounted) setStats(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void fetchStats()
    return () => {
      mounted = false
    }
  }, [enabled])

  return { stats, loading }
}
