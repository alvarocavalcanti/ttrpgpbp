import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { useAdminThreads, useAdminThreadActions } from './useAdminThreads'
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

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    await act(async () => { await result.current.loadMore() })

    expect(result.current.threads).toHaveLength(51)
    expect(result.current.threads[50].id).toBe('old')
    expect(mockOr).toHaveBeenCalledWith('last_message_at.lt.2026-08-01T00:00:00Z,and(last_message_at.eq.2026-08-01T00:00:00Z,id.lt.t0)')
  })

  it('surfaces a fetch error', async () => {
    const { chain } = makeChain({ limitError: new Error('boom') })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as any)

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
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

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
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

describe('useAdminThreads mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    } as any)
  })

  // Wires supabase.from for both the list read (select -> order -> limit) and
  // the mutation paths (insert -> select -> single, select -> eq -> single,
  // delete -> eq) so one render covers initial fetch plus mutations.
  function mockFrom({
    insertSingle = { data: null, error: null },
    fullSingle = { data: null, error: null },
    msgError = null,
    deleteError = null
  }: {
    insertSingle?: { data: unknown, error: unknown },
    fullSingle?: { data: unknown, error: unknown },
    msgError?: unknown,
    deleteError?: unknown
  } = {}) {
    const msgInsert = vi.fn().mockResolvedValue({ data: null, error: msgError })
    const threadDeleteEq = vi.fn().mockResolvedValue({ data: null, error: deleteError })
    const threadDelete = vi.fn(() => ({ eq: threadDeleteEq }))
    const insertSelectSingle = vi.fn().mockResolvedValue(insertSingle)
    const threadInsert = vi.fn(() => ({ select: () => ({ single: insertSelectSingle }) }))
    const fullEqSingle = vi.fn().mockResolvedValue(fullSingle)
    const listLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const threadSelect = vi.fn(() => ({
      order: vi.fn(() => ({ order: vi.fn(() => ({ limit: listLimit })) })),
      eq: () => ({ single: fullEqSingle })
    }))
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'admin_threads') return { select: threadSelect, insert: threadInsert, delete: threadDelete } as any
      if (table === 'admin_messages') return { insert: msgInsert } as any
      return {} as any
    })
    return { msgInsert, threadDeleteEq, threadInsert, insertSelectSingle, fullEqSingle }
  }

  it('creates a thread, sends the first message, marks it read and returns the parsed row', async () => {
    const bare = {
      id: 't-new', type: 'announcement', subject: 'Hi', gm_id: null,
      created_by: 'u1', last_message_at: '2026-08-01T00:00:00Z',
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z'
    }
    // Full row includes the creator join and a read row (mark-read ran before
    // the fetch), so the returned thread must not look unread.
    const full = {
      ...bare,
      creator: [{ display_name: 'Admin', avatar_url: null }],
      gm: null,
      admin_thread_reads: [{ last_read_at: '2026-08-01T00:00:01Z' }]
    }
    const mocks = mockFrom({ insertSingle: { data: bare, error: null }, fullSingle: { data: full, error: null } })

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: any
    await act(async () => {
      created = await result.current.createThread({ type: 'announcement', subject: 'Hi', content: 'Body', gmId: null })
    })

    expect(created).not.toBeNull()
    expect(created.id).toBe('t-new')
    expect(created.creator).toEqual({ display_name: 'Admin', avatar_url: null })
    expect(created.unread).toBe(false)
    expect(mocks.threadInsert).toHaveBeenCalledWith({
      type: 'announcement', subject: 'Hi', gm_id: null, created_by: 'u1'
    })
    expect(mocks.msgInsert).toHaveBeenCalledWith({
      thread_id: 't-new', content: 'Body', sender_id: 'u1'
    })
    expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_thread_read', { p_thread_id: 't-new' })
  })

  it('maps a dm without an explicit gm to the signed-in user', async () => {
    const bare = {
      id: 't-dm', type: 'dm', subject: null, gm_id: 'u1',
      created_by: 'u1', last_message_at: '2026-08-01T00:00:00Z',
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
      creator: [{ display_name: 'GM', avatar_url: null }], gm: null,
      admin_thread_reads: []
    }
    const mocks = mockFrom({ insertSingle: { data: bare, error: null }, fullSingle: { data: bare, error: null } })

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createThread({ type: 'dm', subject: null, content: 'yo', gmId: null })
    })

    expect(mocks.threadInsert).toHaveBeenCalledWith({
      type: 'dm', subject: null, gm_id: 'u1', created_by: 'u1'
    })
  })

  it('toasts and returns null when the thread insert fails', async () => {
    mockFrom({ insertSingle: { data: null, error: { message: 'fail' } } })

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: any
    await act(async () => {
      created = await result.current.createThread({ type: 'announcement', subject: 'Hi', content: 'Body', gmId: null })
    })

    expect(created).toBeNull()
    expect(document.body.textContent).toContain("Couldn't start the conversation")
  })

  it('rolls back the empty thread and toasts when the first message fails', async () => {
    const bare = { id: 't-new', type: 'announcement', subject: 'Hi', gm_id: null, created_by: 'u1' }
    const mocks = mockFrom({
      insertSingle: { data: bare, error: null },
      msgError: { message: 'send failed' }
    })

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: any
    await act(async () => {
      created = await result.current.createThread({ type: 'announcement', subject: 'Hi', content: 'Body', gmId: null })
    })

    expect(created).toBeNull()
    expect(mocks.threadDeleteEq).toHaveBeenCalledWith('id', 't-new')
    expect(document.body.textContent).toContain("Couldn't send your message")
    expect(document.body.textContent).not.toContain('empty conversation may remain')
  })

  it('warns about the stranded thread when the rollback itself fails', async () => {
    const bare = { id: 't-new', type: 'announcement', subject: 'Hi', gm_id: null, created_by: 'u1' }
    mockFrom({
      insertSingle: { data: bare, error: null },
      msgError: { message: 'send failed' },
      deleteError: { message: 'rollback failed' }
    })

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: any
    await act(async () => {
      created = await result.current.createThread({ type: 'announcement', subject: 'Hi', content: 'Body', gmId: null })
    })

    expect(created).toBeNull()
    expect(document.body.textContent).toContain('empty conversation may remain')
  })

  it('returns the parsed thread from the full-row fetch for validation', async () => {
    // A row that fails AdminThreadRowSchema (missing id) must yield null
    // instead of being cast blindly.
    const bare = { id: 't-new', type: 'announcement', subject: 'Hi', gm_id: null, created_by: 'u1' }
    mockFrom({ insertSingle: { data: bare, error: null }, fullSingle: { data: { nope: true }, error: null } })

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: any
    await act(async () => {
      created = await result.current.createThread({ type: 'announcement', subject: 'Hi', content: 'Body', gmId: null })
    })

    expect(created).toBeNull()
  })

  it('refuses to create without a signed-in user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const mocks = mockFrom()

    const { result } = renderHook(() => useAdminThreads(), { wrapper: toastWrapper })

    let created: any
    await act(async () => {
      created = await result.current.createThread({ type: 'announcement', subject: 'Hi', content: 'Body', gmId: null })
    })

    expect(created).toBeNull()
    expect(mocks.threadInsert).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('You need to be signed in.')
  })

  it('deletes a thread and reports success', async () => {
    const mocks = mockFrom()

    const { result } = renderHook(() => useAdminThreadActions(), { wrapper: toastWrapper })

    let ok = false
    await act(async () => {
      ok = await result.current.deleteThread('t-1')
    })

    expect(ok).toBe(true)
    expect(mocks.threadDeleteEq).toHaveBeenCalledWith('id', 't-1')
  })

  it('toasts and reports failure when a thread delete fails', async () => {
    mockFrom({ deleteError: { message: 'RLS block' } })

    const { result } = renderHook(() => useAdminThreadActions(), { wrapper: toastWrapper })

    let ok = true
    await act(async () => {
      ok = await result.current.deleteThread('t-1')
    })

    expect(ok).toBe(false)
    expect(document.body.textContent).toContain("Couldn't delete the conversation")
  })
})