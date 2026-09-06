import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { useSafetyCardEvents } from './useSafetyCardEvents'
import { ToastProvider } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn()
  }
}))

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

// The GM mount now runs a catch-up SELECT and dismissal runs an UPDATE, both
// against safety_card_events. Build separate thenable chains per operation so
// each can resolve with its own result (the real builder is thenable too).
function mockSupabaseQuery(fetchResult: { count?: number | null; error?: unknown } = { count: 0, error: null }, updateResult: { error?: unknown } = { error: null }) {
  const buildChain = (result: unknown) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const op of ['select', 'update', 'eq', 'is', 'gt']) {
      chain[op] = vi.fn(() => chain)
    }
    chain.then = vi.fn((onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected)
    ) as any
    return chain
  }
  const fetchChain = buildChain(fetchResult) as any
  const updateChain = buildChain(updateResult) as any
  vi.mocked(supabase.from).mockReturnValue({
    select: (...args: any[]) => {
      fetchChain.select(...args)
      return fetchChain
    },
    update: (...args: any[]) => {
      updateChain.update(...args)
      return updateChain
    }
  } as any)
  return { fetchChain, updateChain }
}

function mockRealtimeChannel() {
  let cardCallback: ((payload: unknown) => void) | undefined
  const mockOn = vi.fn().mockImplementation((_event, _config, callback) => {
    cardCallback = callback
    return { on: mockOn, subscribe: vi.fn() }
  })
  vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)
  return () => cardCallback
}

describe('useSafetyCardEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers an X-Card anonymously and confirms to the presser', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    let success = false
    await act(async () => {
      success = await result.current.triggerXCard()
    })

    expect(success).toBe(true)
    expect(mockInsert).toHaveBeenCalledWith({ channel_id: 'c1', message_id: null })

    const toast = document.body.textContent
    expect(toast).toContain('X-Card sent to the GM')
  })

  it('includes message_id when flagging a specific message', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    await act(async () => {
      await result.current.triggerXCard('m42')
    })

    expect(mockInsert).toHaveBeenCalledWith({ channel_id: 'c1', message_id: 'm42' })
  })

  it('reports failure and shows error toast when insert fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInsert = vi.fn().mockResolvedValue({ error: { message: 'RLS block' } })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    let success = true
    await act(async () => {
      success = await result.current.triggerXCard()
    })

    expect(success).toBe(false)
    expect(document.body.textContent).toContain('Failed to trigger X-Card.')
  })

  it('refuses to trigger without a channel id', async () => {
    const mockInsert = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents(undefined, false), { wrapper })

    let success = true
    await act(async () => {
      success = await result.current.triggerXCard()
    })

    expect(success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('seeds the GM alert from unresolved events on mount', async () => {
    const getCardCallback = mockRealtimeChannel()
    const { fetchChain } = mockSupabaseQuery({ count: 2, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(2)
    })

    expect(fetchChain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(fetchChain.eq).toHaveBeenCalledWith('channel_id', 'c1')
    expect(fetchChain.is).toHaveBeenCalledWith('resolved_at', null)
    // Catch-up window: only events newer than ~7 days ago count.
    const [column, since] = fetchChain.gt.mock.calls[0]
    expect(column).toBe('created_at')
    expect(Date.now() - new Date(since as string).getTime()).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 60_000)
    expect(Date.now() - new Date(since as string).getTime()).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 60_000)

    // A live flag on top of the catch-up keeps counting from the seeded total.
    act(() => {
      getCardCallback()?.({})
    })

    await waitFor(() => {
      expect(result.current.alertCount).toBe(3)
    })
  })

  it('does not activate the alert when there are no unresolved events', async () => {
    mockRealtimeChannel()
    mockSupabaseQuery({ count: 0, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(fetchCountCalls()).toBe(1)
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })

  it('does not fetch catch-up events for non-GM clients', async () => {
    mockRealtimeChannel()
    const { fetchChain } = mockSupabaseQuery({ count: 5, error: null })

    renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    await waitFor(() => {
      expect(supabase.channel).not.toHaveBeenCalled()
    })

    expect(fetchChain.select).not.toHaveBeenCalled()
  })

  it('shows an error toast when the catch-up fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRealtimeChannel()
    mockSupabaseQuery({ count: null, error: { message: 'RLS block' } })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(document.body.textContent).toContain('Failed to load X-Card alerts.')
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })

  it('persists dismissal by resolving the unresolved events', async () => {
    mockRealtimeChannel()
    const { updateChain } = mockSupabaseQuery({ count: 0, error: null }, { error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.dismissAlert()
    })

    expect(updateChain.update).toHaveBeenCalledWith({ resolved_at: expect.any(String) })
    expect(updateChain.eq).toHaveBeenCalledWith('channel_id', 'c1')
    expect(updateChain.is).toHaveBeenCalledWith('resolved_at', null)
    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })

  it('keeps the alert visible when the dismissal write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRealtimeChannel()
    mockSupabaseQuery({ count: 1, error: null }, { error: { message: 'RLS block' } })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
    })

    await act(async () => {
      await result.current.dismissAlert()
    })

    expect(document.body.textContent).toContain('Failed to dismiss X-Card alert.')
    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(0)
  })

  it('activates the GM alert when an X-Card event arrives', async () => {
    const getCardCallback = mockRealtimeChannel()
    mockSupabaseQuery({ count: 0, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(false)
    })

    act(() => {
      getCardCallback()?.({})
    })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    act(() => {
      getCardCallback()?.({})
    })

    await waitFor(() => {
      expect(result.current.alertCount).toBe(2)
    })

    await act(async () => {
      await result.current.dismissAlert()
    })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(false)
    })
  })

  it('ignores X-Card events for non-GM clients', async () => {
    const getCardCallback = mockRealtimeChannel()
    mockSupabaseQuery({ count: 0, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    await waitFor(() => {
      expect(supabase.channel).not.toHaveBeenCalled()
    })

    act(() => {
      getCardCallback()?.({})
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })
})

function fetchCountCalls(): number {
  return vi.mocked(supabase.from).mock.calls.length
}
