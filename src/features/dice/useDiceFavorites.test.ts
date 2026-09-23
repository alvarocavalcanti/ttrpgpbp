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

  it('applies concurrent toggles of different notations without losing one', async () => {
    const { insert } = mockFrom({ data: [], error: null })
    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await act(async () => {})

    // Both toggles read the same render; functional updates keep both.
    await act(async () => {
      await Promise.all([
        result.current.toggleFavorite('1d20'),
        result.current.toggleFavorite('1d8')
      ])
    })
    expect(insert).toHaveBeenCalledTimes(2)
    expect(result.current.favorites).toEqual(['1d20', '1d8'])
  })

  it('keeps a toggle made while the fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const order = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const eq = vi.fn(() => ({ eq, order }))
    const insert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      insert
    } as any)

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    await act(async () => {
      await result.current.toggleFavorite('2d6+1')
    })
    expect(result.current.favorites).toEqual(['2d6+1'])

    // The stale (empty) snapshot arrives after the pin; it must not evict it.
    await act(async () => {
      resolveFetch({ data: [], error: null })
    })
    expect(result.current.favorites).toEqual(['2d6+1'])
  })

  it('honors a removal made while the fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const order = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn(() => terminal({ error: null }))
    } as any)

    const { result } = renderHook(() => useDiceFavorites('c1', true))
    // Pin then unpin while the fetch is still pending.
    await act(async () => {
      await result.current.toggleFavorite('1d20')
    })
    expect(result.current.favorites).toEqual(['1d20'])
    await act(async () => {
      await result.current.toggleFavorite('1d20')
    })
    expect(result.current.favorites).toEqual([])

    // The stale snapshot containing it must not resurrect it.
    await act(async () => {
      resolveFetch({
        data: [{ notation: '1d20', created_at: '2026-01-01T00:00:01Z' }],
        error: null
      })
    })
    await act(async () => {})
    expect(result.current.favorites).toEqual([])
  })

  it('clears favorites when the channel changes, before the new fetch lands', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const order = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)

    const { result, rerender } = renderHook(
      ({ channelId }: { channelId: string | undefined }) => useDiceFavorites(channelId, true),
      { initialProps: { channelId: 'c1' as string | undefined } }
    )
    await act(async () => {
      resolveFetch({
        data: [{ notation: '1d20', created_at: '2026-01-01T00:00:01Z' }],
        error: null
      })
    })
    await waitFor(() => {
      expect(result.current.favorites).toEqual(['1d20'])
    })

    rerender({ channelId: 'c2' })
    // Old channel's chips are gone immediately, not when c2's fetch lands.
    expect(result.current.favorites).toEqual([])
  })

  it('ignores a failed-toggle rollback from the previous channel', async () => {
    let resolveDelete: (value: unknown) => void = () => {}
    let requestedChannel = 'c1'
    const c1Rows = {
      data: [{ notation: '1d20', created_at: '2026-01-01T00:00:01Z' }],
      error: null
    }
    const order = vi.fn().mockImplementation(() => Promise.resolve(
      requestedChannel === 'c1' ? c1Rows : { data: [], error: null }
    ))
    const eq = vi.fn((col: string, val: unknown) => {
      if (col === 'channel_id') requestedChannel = val as string
      return { eq, order }
    })
    const del = vi.fn().mockImplementation(() => terminal(new Promise(resolve => { resolveDelete = resolve })))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      delete: del
    } as any)

    const { result, rerender } = renderHook(
      ({ channelId }: { channelId: string | undefined }) => useDiceFavorites(channelId, true),
      { initialProps: { channelId: 'c1' as string | undefined } }
    )
    await waitFor(() => {
      expect(result.current.favorites).toEqual(['1d20'])
    })

    let removal: Promise<void>
    act(() => {
      removal = result.current.toggleFavorite('1d20')
    })
    expect(result.current.favorites).toEqual([])

    // Switch channels while the delete is in flight; c2 has no favorites.
    rerender({ channelId: 'c2' })
    await act(async () => {})
    expect(result.current.favorites).toEqual([])

    // … then the delete fails: the c1 row must not reappear under c2.
    await act(async () => {
      resolveDelete({ error: new Error('DB error') })
      await removal
    })
    expect(result.current.favorites).toEqual([])
  })
})
