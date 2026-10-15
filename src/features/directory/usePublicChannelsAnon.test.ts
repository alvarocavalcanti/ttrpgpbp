import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePublicChannelsAnon } from './usePublicChannelsAnon'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    name: `Game ${index}`,
    description: 'A weekly game.',
    ...overrides,
  }
}

const fullPage = Array.from({ length: 20 }, (_, i) => row(i))

describe('usePublicChannelsAnon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the first page from the anonymous projection', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row(1)], error: null } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('list_public_channels_anon', {
      p_limit: 20,
      p_offset: 0,
    })
    expect(result.current.channels).toEqual([{ name: 'Game 1', description: 'A weekly game.' }])
    expect(result.current.error).toBeNull()
  })

  it('drops rows that fail runtime validation', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [row(1), { description: 'no name' }, null],
      error: null,
    } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.channels).toHaveLength(1)
  })

  it('surfaces an RPC error instead of an empty list', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('boom') } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('reports hasMore only for a full page', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: fullPage, error: null } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row(1)], error: null } as any)
    act(() => {
      result.current.refetch()
    })

    await waitFor(() => expect(result.current.hasMore).toBe(false))
  })

  it('loadMore appends the next page at the current offset', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any)
      .mockResolvedValueOnce({ data: [row(21)], error: null } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loadMore()
    })

    expect(supabase.rpc).toHaveBeenLastCalledWith('list_public_channels_anon', {
      p_limit: 20,
      p_offset: 20,
    })
    expect(result.current.channels).toHaveLength(21)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.loadingMore).toBe(false)
  })

  it('keeps the loaded games and flags loadMoreError when a page request fails', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any)
      .mockResolvedValueOnce({ data: null, error: new Error('boom') } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.channels).toHaveLength(20)
    expect(result.current.error).toBeNull()
    expect(result.current.loadMoreError).toBeInstanceOf(Error)
  })

  it('skips the query entirely when disabled', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row(1)], error: null } as any)

    const { result } = renderHook(() => usePublicChannelsAnon({ enabled: false }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.channels).toEqual([])
    expect(result.current.hasMore).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('refetch re-runs the first page', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row(1)], error: null } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.refetch()
    })

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2))
  })

  it('discards a page that resolves after a retry replaced the list', async () => {
    let resolveStale!: (value: { data: unknown; error: null }) => void
    const stalePage = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveStale = resolve
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any) // first page
      .mockReturnValueOnce(stalePage as any) // loadMore, in flight
      .mockResolvedValueOnce({ data: [row(99)], error: null } as any) // retry

    const { result } = renderHook(() => usePublicChannelsAnon())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let staleCall!: Promise<void>
    act(() => {
      staleCall = result.current.loadMore()
    })
    act(() => {
      result.current.refetch()
    })
    await waitFor(() => expect(result.current.channels.map((c) => c.name)).toEqual(['Game 99']))

    await act(async () => {
      resolveStale({ data: [row(1)], error: null })
      await staleCall
    })

    expect(result.current.channels.map((c) => c.name)).toEqual(['Game 99'])
  })

  it('ignores a second loadMore while one is in flight', async () => {
    let resolveFirst!: (value: { data: unknown; error: null }) => void
    const pending = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveFirst = resolve
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any)
      .mockReturnValueOnce(pending as any)
      .mockResolvedValueOnce({ data: [row(21)], error: null } as any)

    const { result } = renderHook(() => usePublicChannelsAnon())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.loadMore()
      second = result.current.loadMore()
    })
    await act(async () => {
      resolveFirst({ data: [row(21)], error: null })
      await first
      await second
    })

    // One page fetched and appended, not two.
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(result.current.channels).toHaveLength(21)
  })
})
