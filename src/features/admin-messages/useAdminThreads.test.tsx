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
})