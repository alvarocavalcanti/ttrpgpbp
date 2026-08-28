import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAdminThreads } from './useAdminThreads'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn()
  }
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

const row = (over: Record<string, unknown> = {}) => ({
  id: 't-1',
  type: 'announcement',
  subject: 'Hi',
  gm_id: null,
  created_by: 'a1',
  last_message_at: '2026-08-01T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  creator: [{ display_name: 'Admin', avatar_url: null }],
  gm: null,
  admin_thread_reads: [],
  ...over
})

// Builder exposing the chain the hook calls: select -> order -> order -> {limit|or}.
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

describe('useAdminThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    } as any)
  })

  // Grabs the realtime handler registered for a given table so a test can fire
  // an event through it (e.g. a DELETE payload) the way the hook would.
  function captureChannel(on: ReturnType<typeof vi.fn>) {
    const handlers: Array<{ config: Record<string, unknown>, cb: (payload: any) => void }> = []
    on.mockImplementation((_type: string, config: Record<string, unknown>, cb: (payload: any) => void) => {
      handlers.push({ config, cb })
      return { on, subscribe: vi.fn() }
    })
    return (table: string) => handlers.find(h => h.config.table === table)!.cb
  }

  it('fetches the first page of threads and flattens creator/gm', async () => {
    const { chain, mockLimit } = makeChain({ limitData: [row({ id: 't-1', creator: [{ display_name: 'Admin', avatar_url: null }], admin_thread_reads: [{ last_read_at: '2026-07-01T00:00:00Z' }] })] })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const { result } = renderHook(() => useAdminThreads())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.threads).toHaveLength(1)
    expect(result.current.threads[0].creator).toEqual({ display_name: 'Admin', avatar_url: null })
    expect(result.current.threads[0].unread).toBe(true)
    expect(result.current.hasMore).toBe(false)
    expect(mockLimit).toHaveBeenCalled()
  })

  it('appends older threads and uses a composite cursor at the same-timestamp boundary', async () => {
    // Newest-first descending page where every row shares last_message_at, so
    // ordering falls back to id DESC (t49 newest … t0 oldest).
    const firstPage = Array.from({ length: 50 }, (_, i) => row({ id: `t${49 - i}`, last_message_at: '2026-08-01T00:00:00Z' }))
    const { chain, mockOr } = makeChain({ limitData: firstPage, orData: [row({ id: 'old', last_message_at: '2026-07-31T00:00:00Z' })] })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const { result } = renderHook(() => useAdminThreads())
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    await act(async () => { await result.current.loadMore() })

    expect(result.current.threads).toHaveLength(51)
    expect(result.current.threads[50].id).toBe('old')
    expect(mockOr).toHaveBeenCalledWith('last_message_at.lt.2026-08-01T00:00:00Z,and(last_message_at.eq.2026-08-01T00:00:00Z,id.lt.t0)')
  })

  it('surfaces a fetch error', async () => {
    const { chain } = makeChain({ limitError: new Error('boom') })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const { result } = renderHook(() => useAdminThreads())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toEqual(new Error('boom'))
    expect(result.current.threads).toHaveLength(0)
  })

  it('refetch merges the newest page without dropping loaded older threads', async () => {
    // First page of 50 fills the page (hasMore true), then loadMore appends an
    // older thread, then refetch returns a newer page that must merge on top.
    const firstPage = Array.from({ length: 50 }, (_, i) => row({ id: `t${49 - i}`, last_message_at: '2026-08-01T00:00:00Z' }))
    const older = row({ id: 'old', last_message_at: '2026-07-31T00:00:00Z' })
    const newer = row({ id: 'fresh', last_message_at: '2026-08-02T00:00:00Z' })
    const mockOr = vi.fn()
    const mockLimit = vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [newer], error: null })
    const mockOrLimit = vi.fn().mockResolvedValue({ data: [older], error: null })
    const chain = { order: vi.fn().mockReturnThis(), or: mockOr, limit: mockLimit }
    mockOr.mockReturnValue({ limit: mockOrLimit })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const { result } = renderHook(() => useAdminThreads())
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    await act(async () => { await result.current.loadMore() })
    expect(result.current.threads).toHaveLength(51)
    expect(result.current.threads[50].id).toBe('old')

    await act(async () => { await result.current.refetch() })

    expect(result.current.threads).toHaveLength(52)
    expect(result.current.threads[0].id).toBe('fresh')
    expect(result.current.threads[51].id).toBe('old')
  })

  it('removes a deleted thread from the loaded list on a DELETE realtime event', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => row({ id: `t${49 - i}`, last_message_at: '2026-08-01T00:00:00Z' }))
    const { chain } = makeChain({ limitData: firstPage })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const channelOn = vi.fn()
    const fireAdminThreads = captureChannel(channelOn)
    vi.mocked(supabase.channel).mockReturnValue({ on: channelOn, subscribe: vi.fn() } as any)

    const { result } = renderHook(() => useAdminThreads())
    await waitFor(() => expect(result.current.threads).toHaveLength(50))
    expect(result.current.threads[0].id).toBe('t49')

    await act(async () => {
      fireAdminThreads('admin_threads')({ eventType: 'DELETE', old: { id: 't49' } })
    })

    expect(result.current.threads).toHaveLength(49)
    expect(result.current.threads.some(t => t.id === 't49')).toBe(false)
  })

  it('ignores a stale fetchFirstPage response that resolves out of order', async () => {
    // First limit() call (initial load) is deferred; the realtime-triggered
    // second fetch resolves first. When the stale first response lands later,
    // it must not overwrite threads/loading/error.
    let resolveStale!: (v: { data: any, error: any }) => void
    const stalePromise = new Promise<{ data: any, error: any }>(res => { resolveStale = res })
    const mockLimit = vi.fn()
      .mockReturnValueOnce(stalePromise)
      .mockReturnValueOnce(Promise.resolve({ data: [row({ id: 'fresh', last_message_at: '2026-08-02T00:00:00Z' })], error: null }))
    const chain = { order: vi.fn().mockReturnThis(), or: vi.fn(), limit: mockLimit }
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const channelOn = vi.fn()
    const fireAdminMessages = captureChannel(channelOn)
    vi.mocked(supabase.channel).mockReturnValue({ on: channelOn, subscribe: vi.fn() } as any)

    const { result } = renderHook(() => useAdminThreads())
    // Trigger the newer fetch (bumps generation) before the stale initial load
    // resolves. The newer response lands first.
    await act(async () => {
      fireAdminMessages('admin_messages')({ eventType: 'INSERT', new: {} })
    })
    await waitFor(() => expect(result.current.threads[0].id).toBe('fresh'))

    // The stale (older) response now resolves and must be discarded.
    await act(async () => {
      resolveStale({ data: [row({ id: 'stale', last_message_at: '2026-08-01T00:00:00Z' })], error: null })
    })

    expect(result.current.threads).toHaveLength(1)
    expect(result.current.threads[0].id).toBe('fresh')
    expect(result.current.loading).toBe(false)
  })
})