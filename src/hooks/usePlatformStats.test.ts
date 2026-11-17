import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePlatformStats } from './usePlatformStats'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

// DAMP literals: the RPC returns snake_case, the hook exposes camelCase.
const row = {
  games: 42,
  messages: 1_240,
  members: 17,
  active_games: 5,
  recruiting_games: 3,
  new_games_week: 2,
}

describe('usePlatformStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reads the one role-agnostic platform projection', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row], error: null } as never)

    const { result } = renderHook(() => usePlatformStats())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('get_platform_stats')
    expect(result.current.stats).toEqual({
      games: 42,
      messages: 1_240,
      members: 17,
      activeGames: 5,
      recruitingGames: 3,
      newGamesWeek: 2,
    })
  })

  it('skips the request entirely when disabled', async () => {
    const { result } = renderHook(() => usePlatformStats({ enabled: false }))

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(result.current.stats).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('drops the band silently when the RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'down' } } as never)

    const { result } = renderHook(() => usePlatformStats())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats).toBeNull()
  })

  it('drops the band silently when the request rejects', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => usePlatformStats())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats).toBeNull()
  })

  it('drops the band when the payload is empty or malformed', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    const empty = renderHook(() => usePlatformStats())
    await waitFor(() => expect(empty.result.current.loading).toBe(false))
    expect(empty.result.current.stats).toBeNull()

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ games: 'lots' }], error: null } as never)
    const malformed = renderHook(() => usePlatformStats())
    await waitFor(() => expect(malformed.result.current.loading).toBe(false))
    expect(malformed.result.current.stats).toBeNull()
  })
})
