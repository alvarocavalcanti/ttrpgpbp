import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDiceFavorites, MAX_FAVORITES } from './useDiceFavorites'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

// Chainable stub: every .eq() returns a thenable that also keeps chaining,
// so .select().eq().eq().order() and .delete().eq().eq().eq() both work.
function terminal(result: unknown) {
  const t: any = Promise.resolve(result)
  t.eq = vi.fn(() => t)
  return t
}

function mockFrom(selectResult: unknown = { data: [], error: null }) {
  const order = vi.fn().mockResolvedValue(selectResult)
  const eq = vi.fn(() => ({ eq, order }))
  const select = vi.fn(() => ({ eq }))
  const del = vi.fn(() => terminal({ error: null }))
  const insert = vi.fn().mockResolvedValue({ error: null })
  vi.mocked(supabase.from).mockReturnValue({ select, delete: del, insert } as any)
  return { select, eq, order, del, insert }
}

describe('useDiceFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it(`caps the list at ${MAX_FAVORITES}`, () => {
    expect(MAX_FAVORITES).toBe(3)
  })

  it('does not fetch when disabled, channel-less, or user-less', async () => {
    mockFrom()
    const { rerender } = renderHook(
      ({ channelId, enabled }: { channelId: string | undefined; enabled: boolean }) =>
        useDiceFavorites(channelId, enabled),
      { initialProps: { channelId: 'c1' as string | undefined, enabled: false } }
    )
    expect(supabase.from).not.toHaveBeenCalled()

    rerender({ channelId: undefined, enabled: true })
    await act(async () => {})
    expect(supabase.from).not.toHaveBeenCalled()

    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    rerender({ channelId: 'c1', enabled: true })
    await act(async () => {})
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('fetches the user channel favorites oldest-first, scoped to the user', async () => {
    const { eq } = mockFrom({
      data: [
        { notation: '1d20', created_at: '2026-01-01T00:00:01Z' },
        { notation: '2d6+1', created_at: '2026-01-01T00:00:02Z' }
      ],
      error: null
    })

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favorites).toEqual(['1d20', '2d6+1'])
    })
    expect(supabase.from).toHaveBeenCalledWith('dice_roll_favorites')
    expect(eq).toHaveBeenCalledWith('channel_id', 'c1')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(result.current.canFavorite).toBe(true)
  })

  it('dedupes, drops malformed rows, and caps at 3', async () => {
    mockFrom({
      data: [
        { notation: '1d20', created_at: '2026-01-01T00:00:01Z' },
        { notation: '1d20', created_at: '2026-01-01T00:00:02Z' },
        { notation: 42, created_at: '2026-01-01T00:00:03Z' },
        { notation: '2d6' },
        'garbage',
        { notation: '1d8', created_at: '2026-01-01T00:00:04Z' },
        { notation: '1d4', created_at: '2026-01-01T00:00:05Z' },
        { notation: '2d20kh1', created_at: '2026-01-01T00:00:06Z' }
      ],
      error: null
    })

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favorites).toEqual(['1d20', '1d8', '1d4'])
    })
    expect(result.current.canFavorite).toBe(false)
  })

  it('ignores the response when disabled mid-flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const order = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)

    const { result, rerender } = renderHook(
      ({ enabled }) => useDiceFavorites('c1', enabled),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: false })

    await act(async () => {
      resolveFetch({ data: [{ notation: '1d20', created_at: '2026-01-01T00:00:01Z' }], error: null })
    })
    expect(result.current.favorites).toEqual([])
  })

  it('toggleFavorite inserts and optimistically adds', async () => {
    const { insert } = mockFrom({ data: [], error: null })
    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await act(async () => {})

    await act(async () => {
      await result.current.toggleFavorite('2d6+1')
    })
    expect(insert).toHaveBeenCalledWith({ channel_id: 'c1', user_id: 'u1', notation: '2d6+1' })
    expect(result.current.favorites).toEqual(['2d6+1'])
    expect(result.current.isFavorite('2d6+1')).toBe(true)
  })

  it('toggleFavorite deletes and optimistically removes', async () => {
    const { del } = mockFrom({
      data: [{ notation: '2d6+1', created_at: '2026-01-01T00:00:01Z' }],
      error: null
    })
    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favorites).toEqual(['2d6+1'])
    })

    await act(async () => {
      await result.current.toggleFavorite('2d6+1')
    })
    expect(del).toHaveBeenCalled()
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('dice_roll_favorites')
    expect(result.current.favorites).toEqual([])
  })

  it('toggleFavorite does nothing at the cap', async () => {
    const { insert } = mockFrom({
      data: [
        { notation: '1d20', created_at: '2026-01-01T00:00:01Z' },
        { notation: '1d8', created_at: '2026-01-01T00:00:02Z' },
        { notation: '1d4', created_at: '2026-01-01T00:00:03Z' }
      ],
      error: null
    })
    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.canFavorite).toBe(false)
    })

    await act(async () => {
      await result.current.toggleFavorite('2d6')
    })
    expect(insert).not.toHaveBeenCalled()
    expect(result.current.favorites).toHaveLength(3)
  })

  it('reverts the optimistic add when the insert fails', async () => {
    const failing = terminal({ error: new Error('DB error') })
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      delete: vi.fn(() => terminal({ error: null })),
      insert: vi.fn().mockReturnValue(failing)
    } as any)

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await act(async () => {})

    await act(async () => {
      await result.current.toggleFavorite('2d6+1')
    })
    expect(result.current.favorites).toEqual([])
  })

  it('reverts the optimistic remove when the delete fails', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ notation: '2d6+1', created_at: '2026-01-01T00:00:01Z' }],
      error: null
    })
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      delete: vi.fn(() => terminal({ error: new Error('DB error') })),
      insert: vi.fn().mockResolvedValue({ error: null })
    } as any)

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favorites).toEqual(['2d6+1'])
    })

    await act(async () => {
      await result.current.toggleFavorite('2d6+1')
    })
    expect(result.current.favorites).toEqual(['2d6+1'])
  })

  it('ignores a second toggle while one is in flight', async () => {
    let resolveInsert: (value: unknown) => void = () => {}
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn(() => ({ eq, order }))
    const insert = vi.fn().mockImplementation(() => new Promise(resolve => { resolveInsert = resolve }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      insert
    } as any)

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await act(async () => {})

    let first: Promise<void>
    act(() => {
      first = result.current.toggleFavorite('2d6+1')
      // Second toggle lands while the first is still pending.
      void result.current.toggleFavorite('2d6+1')
    })
    await act(async () => {
      resolveInsert({ error: null })
      await first
    })
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('toggleFavorite is a no-op without a channel or user', async () => {
    const { insert } = mockFrom({ data: [], error: null })
    const { result } = renderHook(() => useDiceFavorites(undefined, true))
    await act(async () => {
      await result.current.toggleFavorite('1d20')
    })
    expect(insert).not.toHaveBeenCalled()

    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const { result: noUser } = renderHook(() => useDiceFavorites('c1', true))
    await act(async () => {
      await noUser.current.toggleFavorite('1d20')
    })
    expect(insert).not.toHaveBeenCalled()
  })
})
