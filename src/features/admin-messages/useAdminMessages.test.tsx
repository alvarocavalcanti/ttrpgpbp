import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAdminMessages } from './useAdminMessages'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn()
  }
}))

const msg = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  thread_id: 'thread-1',
  sender_id: 'u1',
  content: 'hello',
  is_deleted: false,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  sender: [{ display_name: 'Admin', avatar_url: null }],
  ...over
})

function makeChain({ limitData, limitError, orData, orError }: { limitData?: any, limitError?: any, orData?: any, orError?: any }) {
  const mockOr = vi.fn()
  const mockLimit = vi.fn()
  const mockOrder = vi.fn()
  const mockOrLimit = vi.fn()
  const chain = { order: mockOrder, or: mockOr, limit: mockLimit }
  mockOrder.mockReturnValue(chain)
  mockOr.mockReturnValue({ limit: mockOrLimit })
  if (limitError) mockLimit.mockResolvedValueOnce({ data: null, error: limitError })
  else mockLimit.mockResolvedValue({ data: limitData ?? [], error: null })
  mockOrLimit.mockResolvedValue({ data: orData ?? [], error: orError ?? null })
  return { chain, mockOrder, mockOr, mockLimit }
}

describe('useAdminMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    } as any)
  })

  it('fetches messages newest-first and displays them ascending', async () => {
    const { chain, mockLimit } = makeChain({ limitData: [msg({ id: 'm2', created_at: '2026-08-02T00:00:00Z' }), msg({ id: 'm1', created_at: '2026-08-01T00:00:00Z' })] })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.messages.map(m => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.messages[0].sender).toEqual({ display_name: 'Admin', avatar_url: null })
    expect(mockLimit).toHaveBeenCalled()
  })

  it('prepends older messages on loadMore with a cursor', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => msg({ id: `m${i}`, created_at: `2026-08-01T00:00:0${i % 10}Z` }))
    const { chain, mockOr } = makeChain({ limitData: firstPage, orData: [msg({ id: 'old', created_at: '2026-07-31T00:00:00Z' })] })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'))
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    await act(async () => { await result.current.loadMore() })

    expect(result.current.messages).toHaveLength(51)
    expect(result.current.messages[0].id).toBe('old')
    expect(mockOr).toHaveBeenCalled()
  })

  it('surfaces a fetch error', async () => {
    const { chain } = makeChain({ limitError: new Error('boom') })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toEqual(new Error('boom'))
    expect(result.current.messages).toHaveLength(0)
  })

  it('keeps older pages loaded by loadMore when refreshed', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => msg({ id: `m${i}`, created_at: `2026-08-01T00:00:0${i % 10}Z` }))
    const { chain } = makeChain({ limitData: firstPage, orData: [msg({ id: 'old', created_at: '2026-07-31T00:00:00Z' })] })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'))
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    await act(async () => { await result.current.loadMore() })
    expect(result.current.messages).toHaveLength(51)

    // A refresh (realtime event or Retry) returns the same newest page; the
    // older page loaded by loadMore must survive instead of being reset.
    await act(async () => { await result.current.refetch() })

    expect(result.current.messages).toHaveLength(51)
    expect(result.current.messages[0].id).toBe('old')
  })

  it('ignores stale results from a previous thread', async () => {
    let resolveA: ((v: { data: unknown[]; error: null }) => void) | undefined
    const deferredA = new Promise<{ data: unknown[]; error: null }>(r => { resolveA = r })
    const orderA = vi.fn()
    const chainA = { order: orderA, or: vi.fn(), limit: vi.fn().mockReturnValue(deferredA) }
    orderA.mockReturnValue(chainA)
    const orderB = vi.fn()
    const chainB = { order: orderB, or: vi.fn(), limit: vi.fn().mockResolvedValue({ data: [msg({ id: 'b1' })], error: null }) }
    orderB.mockReturnValue(chainB)
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn((...args: unknown[]) => (args[1] === 'a' ? chainA : chainB))
      })
    } as any)

    const { result, rerender } = renderHook((tid: string) => useAdminMessages(tid), { initialProps: 'a' })
    rerender('b')
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['b1']))

    // Thread A's slow request resolves after B; its result must be discarded.
    await act(async () => { resolveA?.({ data: [msg({ id: 'a1' })], error: null }) })

    expect(result.current.messages.map(m => m.id)).toEqual(['b1'])
  })

  it('refetches when the initial subscription fails and a retry succeeds', async () => {
    // Initial fetch fails; only the retry-triggered refetch can load messages.
    const mockLimit = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error('db down') })
      .mockResolvedValue({ data: [msg({ id: 'm1' })], error: null })
    const mockOrder = vi.fn()
    const chain = { order: mockOrder, or: vi.fn(), limit: mockLimit }
    mockOrder.mockReturnValue(chain)
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    let statusCb: ((status: string) => void) | undefined
    const on = vi.fn().mockReturnThis()
    vi.mocked(supabase.channel).mockReturnValue({
      on,
      subscribe: vi.fn().mockImplementation(cb => { statusCb = cb; return { unsubscribe: vi.fn() } })
    } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(0)
    })

    vi.useFakeTimers()
    try {
      // Initial subscription attempt fails; retry fires after backoff. The
      // retry's SUBSCRIBED must trigger the catch-up fetch (no fetch was
      // skipped for the failed first attempt).
      await act(async () => {
        statusCb?.('CHANNEL_ERROR')
        await vi.advanceTimersByTimeAsync(1000)
        statusCb?.('SUBSCRIBED')
      })
    } finally {
      vi.useRealTimers()
    }

    await waitFor(() => {
      expect(result.current.messages.map(m => m.id)).toEqual(['m1'])
    })
  })
})