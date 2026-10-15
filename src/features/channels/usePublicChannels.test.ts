import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePublicChannels } from './usePublicChannels'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Game ${id}`,
    gm_display_name: 'Aria',
    game_system: 'shadowdark',
    description: 'A weekly game.',
    constraints: 'Be kind.',
    member_count: 3,
    last_message_at: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

const fullPage = Array.from({ length: 20 }, (_, i) => row(`p${i}`))

describe('usePublicChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the first page and maps the safe projection', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row('1')], error: null } as any)

    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('list_public_channels', {
      p_search: undefined,
      p_game_system: undefined,
      p_limit: 20,
      p_offset: 0,
    })
    expect(result.current.channels).toHaveLength(1)
    expect(result.current.channels[0]).toMatchObject({ id: '1', name: 'Game 1', member_count: 3 })
    expect(result.current.error).toBeNull()
  })

  it('forwards search and game-system filters', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    const { result } = renderHook(() => usePublicChannels({ search: 'dragon', gameSystem: 'shadowdark' }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('list_public_channels', {
      p_search: 'dragon',
      p_game_system: 'shadowdark',
      p_limit: 20,
      p_offset: 0,
    })
  })

  it('drops rows that fail runtime validation', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [row('1'), { name: 'no id' }, null],
      error: null,
    } as any)

    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.channels).toHaveLength(1)
    expect(result.current.channels[0].id).toBe('1')
  })

  it('surfaces an RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('boom') } as any)

    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.channels).toEqual([])
  })

  it('reports hasMore only for a full page', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: fullPage, error: null } as any)
    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row('only')], error: null } as any)
    const short = renderHook(() => usePublicChannels())
    await waitFor(() => expect(short.result.current.loading).toBe(false))
    expect(short.result.current.hasMore).toBe(false)
  })

  it('loadMore appends the next page at the current offset', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any)
      .mockResolvedValueOnce({ data: [row('extra')], error: null } as any)

    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loadMore()
    })

    expect(supabase.rpc).toHaveBeenLastCalledWith('list_public_channels', {
      p_search: undefined,
      p_game_system: undefined,
      p_limit: 20,
      p_offset: 20,
    })
    expect(result.current.channels).toHaveLength(21)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.loadingMore).toBe(false)
  })

  it('skips the query while disabled', () => {
    const { result } = renderHook(() => usePublicChannels({ enabled: false }))
    expect(result.current.loading).toBe(false)
    expect(result.current.channels).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('refetch re-runs the first page', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row('1')], error: null } as any)

    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.refetch()
    })

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2))
  })

  it('discards a page that resolves after the query changed', async () => {
    let resolveStale!: (value: { data: unknown; error: null }) => void
    const stalePage = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveStale = resolve
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any) // first page, search ''
      .mockReturnValueOnce(stalePage as any) // loadMore, search ''
      .mockResolvedValueOnce({ data: [row('fresh')], error: null } as any) // first page, search 'x'

    const { result, rerender } = renderHook(
      ({ search }: { search: string }) => usePublicChannels({ search }),
      { initialProps: { search: '' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Start a page for the old query, then change the query before it resolves.
    let staleCall!: Promise<void>
    act(() => {
      staleCall = result.current.loadMore()
    })
    rerender({ search: 'x' })
    await waitFor(() => expect(result.current.channels.map((c) => c.id)).toEqual(['fresh']))

    await act(async () => {
      resolveStale({ data: [row('stale')], error: null })
      await staleCall
    })

    // The stale page must not be appended to the new result set.
    expect(result.current.channels.map((c) => c.id)).toEqual(['fresh'])
  })

  it('ignores a second loadMore while one is in flight', async () => {
    let resolveFirst!: (value: { data: unknown; error: null }) => void
    const firstPage = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveFirst = resolve
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: fullPage, error: null } as any)
      .mockReturnValueOnce(firstPage as any)
      .mockResolvedValueOnce({ data: [row('dup')], error: null } as any)

    const { result } = renderHook(() => usePublicChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let firstCall!: Promise<void>
    let secondCall!: Promise<void>
    act(() => {
      firstCall = result.current.loadMore()
      secondCall = result.current.loadMore()
    })
    await act(async () => {
      resolveFirst({ data: [row('extra')], error: null })
      await firstCall
      await secondCall
    })

    // Only one page was fetched and appended.
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(result.current.channels).toHaveLength(21)
  })
})
