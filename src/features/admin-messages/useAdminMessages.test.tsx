import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { useAdminMessages } from './useAdminMessages'
import { ToastProvider } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

function toastWrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

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
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    } as any)
  })

  it('fetches messages newest-first and displays them ascending', async () => {
    const { chain, mockLimit } = makeChain({ limitData: [msg({ id: 'm2', created_at: '2026-08-02T00:00:00Z' }), msg({ id: 'm1', created_at: '2026-08-01T00:00:00Z' })] })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toEqual(new Error('boom'))
    expect(result.current.messages).toHaveLength(0)
  })

  it('keeps older pages loaded by loadMore when refreshed', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => msg({ id: `m${i}`, created_at: `2026-08-01T00:00:0${i % 10}Z` }))
    const { chain } = makeChain({ limitData: firstPage, orData: [msg({ id: 'old', created_at: '2026-07-31T00:00:00Z' })] })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
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

    const { result, rerender } = renderHook((tid: string) => useAdminMessages(tid), { initialProps: 'a', wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
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

  it('drops a superseded fetch result that resolves after a newer fetch', async () => {
    // Initial fetch hangs; a realtime event starts a newer fetch that returns
    // first. The slow initial response must be discarded, not overwrite it.
    let resolveSlow!: (v: { data: unknown[]; error: null }) => void
    const slow = new Promise<{ data: unknown[]; error: null }>(resolve => { resolveSlow = resolve })
    const mockOrder = vi.fn()
    const mockLimit = vi.fn()
      .mockImplementationOnce(() => slow)
      .mockResolvedValue({ data: [msg({ id: 'new', content: 'fresh' })], error: null })
    mockOrder.mockReturnValue({ order: mockOrder, or: vi.fn(), limit: mockLimit })
    const eq = vi.fn().mockReturnValue({ order: mockOrder })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    let messagesEvent: (() => void) | undefined
    const on = vi.fn().mockImplementation((_event: any, config: any, callback: any) => {
      if (config.table === 'admin_messages') messagesEvent = () => callback({ eventType: 'INSERT', new: {} })
      return { on, subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on } as any)

    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })

    await act(async () => {
      messagesEvent?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.messages.map(m => m.id)).toEqual(['new'])
    })

    await act(async () => {
      resolveSlow({ data: [msg({ id: 'old', content: 'stale' })], error: null })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.messages.map(m => m.id)).toEqual(['new'])
    expect(result.current.loading).toBe(false)
  })

  it('marks the thread read on open and again when messages arrive', async () => {
    const thenable = { then: vi.fn(() => thenable), catch: vi.fn(() => thenable) }
    vi.mocked(supabase.rpc).mockReturnValue(thenable as any)
    const { chain } = makeChain({ limitData: [msg({ id: 'm1' })] })
    const eq = vi.fn().mockReturnValue(chain)
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as any)

    renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })

    // The supabase-js v2 RPC returns a lazy thenable; asserting `.then` was
    // invoked catches a regression where the promise is discarded and the
    // request never fires.
    await waitFor(() => expect(thenable.then).toHaveBeenCalled())
    expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_thread_read', { p_thread_id: 'thread-1' })
    await waitFor(() => expect(thenable.then).toHaveBeenCalledTimes(2))
  })
})

describe('useAdminMessages mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    } as any)
  })

  // Wires supabase.from for both the message read (select -> eq -> order ->
  // order -> limit) and the mutation paths (insert, update -> eq).
  function mockFrom({ insertError = null, updateError = null }: { insertError?: unknown, updateError?: unknown } = {}) {
    const insert = vi.fn().mockResolvedValue({ data: null, error: insertError })
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: updateError })
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const select = vi.fn(() => ({
      eq: () => ({ order: () => ({ order: () => ({ limit }) }) })
    }))
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'admin_messages') return { select, insert, update: () => ({ eq: updateEq }) } as any
      return {} as any
    })
    return { insert, updateEq, limit }
  }

  it('sends a reply as the signed-in user', async () => {
    const mocks = mockFrom()
    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = false
    await act(async () => {
      ok = await result.current.sendReply('my reply')
    })

    expect(ok).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith({
      thread_id: 'thread-1', content: 'my reply', sender_id: 'u1'
    })
    expect(document.body.textContent).not.toContain("Couldn't send your reply")
  })

  it('toasts and reports failure when a reply insert fails', async () => {
    mockFrom({ insertError: { message: 'fail' } })
    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.sendReply('my reply')
    })

    expect(ok).toBe(false)
    expect(document.body.textContent).toContain("Couldn't send your reply")
  })

  it('refuses to reply without a signed-in user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const mocks = mockFrom()
    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })

    let ok = true
    await act(async () => {
      ok = await result.current.sendReply('my reply')
    })

    expect(ok).toBe(false)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('soft-deletes a message and refetches', async () => {
    const mocks = mockFrom()
    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.limit).toHaveBeenCalledTimes(1)

    let ok = false
    await act(async () => {
      ok = await result.current.deleteMessage('m1')
    })

    expect(ok).toBe(true)
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'm1')
    expect(mocks.limit).toHaveBeenCalledTimes(2)
  })

  it('toasts and still refetches when a message delete fails', async () => {
    const mocks = mockFrom({ updateError: { message: 'fail' } })
    const { result } = renderHook(() => useAdminMessages('thread-1'), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.limit).toHaveBeenCalledTimes(1)

    let ok = true
    await act(async () => {
      ok = await result.current.deleteMessage('m1')
    })

    expect(ok).toBe(false)
    expect(document.body.textContent).toContain("Couldn't delete the message")
    // Refetch happens regardless so the view reconciles with the server.
    expect(mocks.limit).toHaveBeenCalledTimes(2)
  })
})