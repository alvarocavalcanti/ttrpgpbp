import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePendingJoinRequests } from './usePendingJoinRequests'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

function request(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    channel_id: 'c1',
    user_id: `u-${id}`,
    character_name: `Hero ${id}`,
    message: 'I would love to join.',
    status: 'pending',
    created_at: '2026-10-15T10:00:00Z',
    ...overrides,
  }
}

// The hook awaits select().eq().eq().order(), so the chain is thenable.
function queryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.order = () => Promise.resolve(result)
  // eslint-disable-next-line unicorn/no-thenable
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

describe('usePendingJoinRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the channel\'s pending applications, oldest first', async () => {
    vi.mocked(supabase.from).mockReturnValue(queryChain({ data: [request('r1')], error: null }) as any)

    const { result } = renderHook(() => usePendingJoinRequests('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.from).toHaveBeenCalledWith('channel_join_requests')
    expect(result.current.requests).toHaveLength(1)
    expect(result.current.requests[0].character_name).toBe('Hero r1')
    expect(result.current.error).toBeNull()
  })

  it('drops rows that fail runtime validation', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      queryChain({ data: [request('r1'), { character_name: 'no id' }, null], error: null }) as any,
    )

    const { result } = renderHook(() => usePendingJoinRequests('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.requests).toHaveLength(1)
  })

  it('surfaces a query error instead of an empty queue', async () => {
    vi.mocked(supabase.from).mockReturnValue(queryChain({ data: null, error: new Error('boom') }) as any)

    const { result } = renderHook(() => usePendingJoinRequests('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('refetch re-runs the query', async () => {
    vi.mocked(supabase.from).mockReturnValue(queryChain({ data: [], error: null }) as any)

    const { result } = renderHook(() => usePendingJoinRequests('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.refetch()
    })

    await waitFor(() => expect(supabase.from).toHaveBeenCalledTimes(2))
  })

  it('clears a previous channel\'s failure when the channel changes', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(queryChain({ data: null, error: new Error('down') }) as any)
      .mockReturnValueOnce(queryChain({ data: [request('r1')], error: null }) as any)

    const { result, rerender } = renderHook(({ id }: { id: string }) => usePendingJoinRequests(id), {
      initialProps: { id: 'c1' },
    })
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))

    rerender({ id: 'c2' })

    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it('skips the query with no channel', async () => {
    const { result } = renderHook(() => usePendingJoinRequests(undefined))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.requests).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('decide goes through decide_join_request', async () => {
    vi.mocked(supabase.from).mockReturnValue(queryChain({ data: [], error: null }) as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)

    const { result } = renderHook(() => usePendingJoinRequests('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.decide('r1', true)
    })

    expect(supabase.rpc).toHaveBeenCalledWith('decide_join_request', {
      p_request_id: 'r1',
      p_approve: true,
    })
  })

  it('decide rejects when the RPC fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(queryChain({ data: [], error: null }) as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ error: new Error('already decided') } as any)

    const { result } = renderHook(() => usePendingJoinRequests('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.decide('r1', false)).rejects.toThrow('already decided')
  })
})
