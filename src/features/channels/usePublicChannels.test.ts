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
})
