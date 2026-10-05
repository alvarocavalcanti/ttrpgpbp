import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMessageFavorites } from './useMessageFavorites'
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

// Chainable stub: every .eq() returns a thenable that also keeps chaining.
function terminal(result: unknown) {
  const t: any = Promise.resolve(result)
  t.eq = vi.fn(() => t)
  return t
}

function mockFrom(selectResult: unknown = { data: [], error: null }) {
  const range = vi.fn().mockResolvedValue(selectResult)
  const order = vi.fn(() => ({ range }))
  const eq = vi.fn(() => ({ eq, order }))
  const select = vi.fn(() => ({ eq }))
  const del = vi.fn(() => terminal({ error: null }))
  const insert = vi.fn().mockResolvedValue({ error: null })
  vi.mocked(supabase.from).mockReturnValue({ select, delete: del, insert } as any)
  return { select, eq, order, range, del, insert }
}

describe('useMessageFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not fetch when disabled, channel-less, or user-less', async () => {
    mockFrom()
    const { rerender } = renderHook(
      ({ channelId, enabled }: { channelId: string | undefined; enabled: boolean }) =>
        useMessageFavorites(channelId, enabled),
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

  it('fetches the user channel favorites scoped to the user', async () => {
    const { eq } = mockFrom({
      data: [
        { message_id: 'm1', created_at: '2026-01-01T00:00:01Z' },
        { message_id: 'm2', created_at: '2026-01-01T00:00:02Z' }
      ],
      error: null
    })

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.isFavorite('m1')).toBe(true)
      expect(result.current.isFavorite('m2')).toBe(true)
    })
    expect(supabase.from).toHaveBeenCalledWith('message_favorites')
    expect(eq).toHaveBeenCalledWith('channel_id', 'c1')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('dedupes and drops malformed rows', async () => {
    mockFrom({
      data: [
        { message_id: 'm1', created_at: '2026-01-01T00:00:01Z' },
        { message_id: 'm1', created_at: '2026-01-01T00:00:02Z' },
        { message_id: 42, created_at: '2026-01-01T00:00:03Z' },
        { message_id: 'm2' },
        'garbage'
      ],
      error: null
    })

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(Array.from(result.current.favoriteIds)).toEqual(['m1'])
    })
  })

  it('pages past the 1,000-row PostgREST cap', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      message_id: `m${i}`,
      created_at: '2026-01-01T00:00:00Z'
    }))
    const range = vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ message_id: 'last', created_at: '2026-01-02T00:00:00Z' }], error: null })
    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favoriteIds.size).toBe(1001)
    })
    expect(result.current.isFavorite('last')).toBe(true)
    expect(range).toHaveBeenCalledTimes(2)
  })

  it('ignores the response when disabled mid-flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const range = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)

    const { result, rerender } = renderHook(
      ({ enabled }) => useMessageFavorites('c1', enabled),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: false })

    await act(async () => {
      resolveFetch({ data: [{ message_id: 'm1', created_at: '2026-01-01T00:00:01Z' }], error: null })
    })
    expect(result.current.favoriteIds.size).toBe(0)
  })

  it('toggleFavorite inserts and optimistically adds', async () => {
    const { insert } = mockFrom({ data: [], error: null })
    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await act(async () => {})

    await act(async () => {
      await result.current.toggleFavorite('m1')
    })
    expect(insert).toHaveBeenCalledWith({ channel_id: 'c1', user_id: 'u1', message_id: 'm1' })
    expect(result.current.isFavorite('m1')).toBe(true)
  })

  it('toggleFavorite deletes and optimistically removes', async () => {
    const { del } = mockFrom({
      data: [{ message_id: 'm1', created_at: '2026-01-01T00:00:01Z' }],
      error: null
    })
    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.isFavorite('m1')).toBe(true)
    })

    await act(async () => {
      await result.current.toggleFavorite('m1')
    })
    expect(del).toHaveBeenCalled()
    expect(result.current.isFavorite('m1')).toBe(false)
  })

  it('reverts the optimistic add when the insert fails', async () => {
    const failing = terminal({ error: new Error('DB error') })
    const order = vi.fn(() => ({ range: vi.fn().mockResolvedValue({ data: [], error: null }) }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      delete: vi.fn(() => terminal({ error: null })),
      insert: vi.fn().mockReturnValue(failing)
    } as any)

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await act(async () => {})

    await expect(act(async () => {
      await result.current.toggleFavorite('m1')
    })).rejects.toThrow('DB error')
    expect(result.current.isFavorite('m1')).toBe(false)
  })

  it('reverts the optimistic remove when the delete fails', async () => {
    const order = vi.fn(() => ({ range: vi.fn().mockResolvedValue({
      data: [{ message_id: 'm1', created_at: '2026-01-01T00:00:01Z' }],
      error: null
    }) }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      delete: vi.fn(() => terminal({ error: new Error('DB error') })),
      insert: vi.fn().mockResolvedValue({ error: null })
    } as any)

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.isFavorite('m1')).toBe(true)
    })

    await expect(act(async () => {
      await result.current.toggleFavorite('m1')
    })).rejects.toThrow('DB error')
    expect(result.current.isFavorite('m1')).toBe(true)
  })

  it('ignores a second toggle while one is in flight', async () => {
    let resolveInsert: (value: unknown) => void = () => {}
    const order = vi.fn(() => ({ range: vi.fn().mockResolvedValue({ data: [], error: null }) }))
    const eq = vi.fn(() => ({ eq, order }))
    const insert = vi.fn().mockImplementation(() => new Promise(resolve => { resolveInsert = resolve }))
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({ eq })),
      insert
    } as any)

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await act(async () => {})

    let first: Promise<void>
    act(() => {
      first = result.current.toggleFavorite('m1')
      // Second toggle lands while the first is still pending.
      void result.current.toggleFavorite('m1')
    })
    await act(async () => {
      resolveInsert({ error: null })
      await first
    })
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('drops favorites when the channel scope changes', async () => {
    mockFrom({ data: [{ message_id: 'm1', created_at: '2026-01-01T00:00:01Z' }], error: null })
    const { result, rerender } = renderHook(
      ({ channelId }) => useMessageFavorites(channelId, true),
      { initialProps: { channelId: 'c1' } }
    )
    await waitFor(() => {
      expect(result.current.isFavorite('m1')).toBe(true)
    })

    mockFrom({ data: [], error: null })
    rerender({ channelId: 'c2' })
    await waitFor(() => {
      expect(result.current.favoriteIds.size).toBe(0)
    })
  })

  it('does nothing on toggle without a channel or user', async () => {
    const { insert } = mockFrom({ data: [], error: null })
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await act(async () => {})

    await act(async () => {
      await result.current.toggleFavorite('m1')
    })
    expect(insert).not.toHaveBeenCalled()
  })

  // A full favorite row as served by the embedded select (#672).
  const embeddedMessage = (id: string) => ({
    id,
    channel_id: 'c1',
    sender_id: 'u1',
    content: `content of ${id}`,
    type: 'regular',
    whisper_to: null,
    reply_to: null,
    npc_name: null,
    npc_avatar_url: null,
    is_deleted: false,
    is_edited: false,
    created_at: '2026-01-01T00:00:01Z',
    updated_at: '2026-01-01T00:00:01Z',
    roll_dc: null,
    roll_success: null,
    sender: { display_name: 'Hero', avatar_url: null }
  })

  it('exposes the favorited messages with joins normalized (#672)', async () => {
    mockFrom({
      data: [
        {
          message_id: 'm1',
          created_at: '2026-01-01T00:00:01Z',
          message: {
            ...embeddedMessage('m1'),
            reply_to: 'm0',
            sender: [{ display_name: 'Hero', avatar_url: null }],
            reply: [{ id: 'm0', content: 'quoted', sender_id: 'u2', is_deleted: false, type: 'regular' }]
          }
        }
      ],
      error: null
    })

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favoriteMessages).toHaveLength(1)
    })
    const [row] = result.current.favoriteMessages
    expect(row.content).toBe('content of m1')
    expect(row.sender).toEqual({ display_name: 'Hero', avatar_url: null })
    expect(row.reply).toMatchObject({ id: 'm0', content: 'quoted' })
  })

  it('drops malformed or hidden embedded messages but keeps the id (#672)', async () => {
    mockFrom({
      data: [
        { message_id: 'm1', created_at: '2026-01-01T00:00:01Z', message: { bogus: true } },
        { message_id: 'm2', created_at: '2026-01-01T00:00:02Z', message: null }
      ],
      error: null
    })

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.isFavorite('m1')).toBe(true)
      expect(result.current.isFavorite('m2')).toBe(true)
    })
    expect(result.current.favoriteMessages).toHaveLength(0)
  })

  it('reports loading while the favorites fetch is in flight (#672)', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const range = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })
    await act(async () => {
      resolveFetch({ data: [], error: null })
    })
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('surfaces fetch failures and clears them on refetch (#672)', async () => {
    const range = vi.fn().mockRejectedValueOnce(new Error('db down'))
    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)

    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.error?.message).toBe('db down')
    })
    expect(result.current.loading).toBe(false)

    range.mockResolvedValueOnce({ data: [], error: null })
    await act(async () => {
      result.current.refetch()
    })
    await waitFor(() => {
      expect(result.current.error).toBeNull()
    })
    expect(range).toHaveBeenCalledTimes(2)
  })

  it('clears the snapshot and error when the channel scope changes (#672)', async () => {
    const range = vi.fn().mockRejectedValueOnce(new Error('db down'))
    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ eq, order }))
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => ({ eq })) } as any)
    const { result, rerender } = renderHook(
      ({ channelId }) => useMessageFavorites(channelId, true),
      { initialProps: { channelId: 'c1' } }
    )
    await waitFor(() => {
      expect(result.current.error?.message).toBe('db down')
    })

    mockFrom({
      data: [{ message_id: 'm9', created_at: '2026-01-01T00:00:01Z', message: embeddedMessage('m9') }],
      error: null
    })
    rerender({ channelId: 'c2' })
    await waitFor(() => {
      expect(result.current.error).toBeNull()
      expect(result.current.favoriteMessages).toHaveLength(1)
    })
    expect(result.current.favoriteMessages[0].id).toBe('m9')
  })

  it('patchFavoriteMessage updates the snapshot row in place (#672)', async () => {
    mockFrom({
      data: [{ message_id: 'm1', created_at: '2026-01-01T00:00:01Z', message: embeddedMessage('m1') }],
      error: null
    })
    const { result } = renderHook(() => useMessageFavorites('c1', true))
    await waitFor(() => {
      expect(result.current.favoriteMessages).toHaveLength(1)
    })

    act(() => {
      result.current.patchFavoriteMessage('m1', { content: 'edited', is_edited: true })
    })
    expect(result.current.favoriteMessages[0].content).toBe('edited')
    expect(result.current.favoriteMessages[0].is_edited).toBe(true)

    act(() => {
      result.current.patchFavoriteMessage('missing', { content: 'x' })
    })
    expect(result.current.favoriteMessages).toHaveLength(1)
  })
})
