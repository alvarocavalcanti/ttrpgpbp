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
  // The subscription now registers INSERT and UPDATE handlers; keep them
  // separate so tests can deliver either event.
  const cardCallbacks: Record<string, ((payload: unknown) => void) | undefined> = {}
  // The catch-up snapshot now starts from SUBSCRIBED, so the subscription
  // mock must deliver that status.
  const mockSubscribe = vi.fn().mockImplementation((cb?: (status: string) => void) => {
    cb?.('SUBSCRIBED')
    return { unsubscribe: vi.fn() }
  })
  const mockOn = vi.fn().mockImplementation((_event, config: { event: string }, callback) => {
    cardCallbacks[config.event] = callback
    return { on: mockOn, subscribe: mockSubscribe }
  })
  vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)
  // Defaults to the INSERT callback (existing tests deliver live flags this
  // way); pass 'UPDATE' for dismissal-sync events.
  return (event = 'INSERT') => cardCallbacks[event]
}

// Same shape as mockSupabaseQuery, but the count result is mutable so a test
// can change what the (repeated) unresolved-count SELECT returns between
// phases — the UPDATE-driven recount queries the same chain again. deferNext
// holds the next count query's resolution so a test can interleave a
// dismissal or INSERT before flushing it (stale-writer race tests).
function mockMutableCountQuery(initial: { count: number | null; error: unknown }) {
  let result = initial
  let holdNext = false
  let release: ((value: unknown) => void) | undefined
  const fetchChain: Record<string, any> = {}
  for (const op of ['select', 'eq', 'is', 'gt']) fetchChain[op] = vi.fn(() => fetchChain)
  fetchChain.then = vi.fn((onFulfilled: any, onRejected: any) => {
    if (holdNext) {
      holdNext = false
      return new Promise((res) => { release = res })
        .then((value: unknown) => Promise.resolve(value).then(onFulfilled, onRejected)) as any
    }
    return Promise.resolve(result).then(onFulfilled, onRejected)
  }) as any
  const updateChain: Record<string, any> = {}
  for (const op of ['update', 'eq', 'is']) updateChain[op] = vi.fn(() => updateChain)
  updateChain.then = vi.fn((onFulfilled: any, onRejected: any) =>
    Promise.resolve({ error: null }).then(onFulfilled, onRejected)) as any
  vi.mocked(supabase.from).mockReturnValue({
    select: (...args: any[]) => { fetchChain.select(...args); return fetchChain },
    update: (...args: any[]) => { updateChain.update(...args); return updateChain }
  } as any)
  return {
    fetchChain,
    setCountResult: (next: { count: number | null; error: unknown }) => { result = next },
    deferNext: () => { holdNext = true },
    flush: () => { const res = release; release = undefined; res?.(result) }
  }
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
    // No created_at horizon: unresolved = unhandled (pre-dismissal-era rows
    // were backfilled resolved by migration 20260907131618). A created_at
    // filter here would hide a flag a GM missed while away >7 days (#431).
    expect(fetchChain.gt).not.toHaveBeenCalled()

    // A live flag on top of the catch-up keeps counting from the seeded total.
    act(() => {
      getCardCallback()?.({})
    })

    await waitFor(() => {
      expect(result.current.alertCount).toBe(3)
    })
  })

  it('surfaces an unresolved flag raised long ago (beyond the old 7-day window)', async () => {
    // A flag pressed while the GM was away >7 days must still surface on
    // mount: the catch-up count has no age horizon anymore (issue #431).
    mockRealtimeChannel()
    const { fetchChain } = mockSupabaseQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    // String literal (DAMP): the old catch-up filtered created_at; the query
    // must carry no such range now.
    expect(fetchChain.gt).not.toHaveBeenCalled()
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
    // The pre-dismiss count comes back with the alert: a multi-flag alert
    // must not lose its tally until reload.
    expect(result.current.alertCount).toBe(1)
  })

  it('ignores a stale catch-up result that lands after dismissal', async () => {
    mockRealtimeChannel()
    // Catch-up SELECT held in flight until we release it, so the GM can
    // dismiss while the query is still pending.
    let releaseCatchUp!: (value: { count: number | null; error: unknown }) => void
    const catchUpPromise = new Promise<{ count: number | null; error: unknown }>(resolve => { releaseCatchUp = resolve })
    const fetchChain: Record<string, any> = {}
    for (const op of ['select', 'eq', 'is', 'gt']) fetchChain[op] = vi.fn(() => fetchChain)
    fetchChain.then = vi.fn((onFulfilled: any, onRejected: any) =>
      catchUpPromise.then(onFulfilled, onRejected)) as any
    const updateChain: Record<string, any> = {}
    for (const op of ['update', 'eq', 'is']) updateChain[op] = vi.fn(() => updateChain)
    updateChain.then = vi.fn((onFulfilled: any, onRejected: any) =>
      Promise.resolve({ error: null }).then(onFulfilled, onRejected)) as any
    vi.mocked(supabase.from).mockReturnValue({
      select: (...args: any[]) => { fetchChain.select(...args); return fetchChain },
      update: (...args: any[]) => { updateChain.update(...args); return updateChain }
    } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalled()
    })

    // GM dismisses while the catch-up SELECT is still in flight.
    await act(async () => {
      await result.current.dismissAlert()
    })
    expect(result.current.alertActive).toBe(false)

    // The pre-dismissal snapshot lands late: it must not re-activate the
    // banner with its stale count.
    await act(async () => {
      releaseCatchUp({ count: 3, error: null })
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(false)
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

  it('starts the catch-up snapshot only after the subscription goes live', async () => {
    // A flag pressed while the subscription is still being set up is missed
    // by the (not yet attached) live stream; only a snapshot taken after
    // SUBSCRIBED can count the committed row.
    let cardCallbacks: Record<string, ((payload: unknown) => void) | undefined> = {}
    let deliverSubscribed!: () => void
    const subscribed = new Promise<void>(resolve => { deliverSubscribed = resolve })
    const mockOn = vi.fn().mockImplementation((_event, config: { event: string }, callback) => {
      cardCallbacks[config.event] = callback
      return {
        on: mockOn,
        subscribe: (cb?: (status: string) => void) => {
          void subscribed.then(() => cb?.('SUBSCRIBED'))
          return { unsubscribe: vi.fn() }
        }
      }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)
    const { fetchChain } = mockSupabaseQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    act(() => {
      cardCallbacks['INSERT']?.({})
    })
    expect(result.current.alertCount).toBe(1)
    // The snapshot must not have fired before SUBSCRIBED.
    expect(fetchChain.select).not.toHaveBeenCalled()

    await act(async () => {
      deliverSubscribed()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
    })
    // The live-arrived count survives the snapshot (count 1 >= live 1).
    expect(result.current.alertCount).toBe(1)
  })

  it('does not let a pending snapshot overwrite a live-arrived count', async () => {
    const getCardCallback = mockRealtimeChannel()
    // Snapshot held in flight so live inserts can land while it is pending.
    let releaseSnapshot!: (value: { count: number | null; error: unknown }) => void
    const snapshotPromise = new Promise<{ count: number | null; error: unknown }>(resolve => { releaseSnapshot = resolve })
    const fetchChain: Record<string, any> = {}
    for (const op of ['select', 'eq', 'is', 'gt']) fetchChain[op] = vi.fn(() => fetchChain)
    fetchChain.then = vi.fn((onFulfilled: any, onRejected: any) =>
      snapshotPromise.then(onFulfilled, onRejected)) as any
    const updateChain: Record<string, any> = {}
    for (const op of ['update', 'eq', 'is']) updateChain[op] = vi.fn(() => updateChain)
    updateChain.then = vi.fn((onFulfilled: any, onRejected: any) =>
      Promise.resolve({ error: null }).then(onFulfilled, onRejected)) as any
    vi.mocked(supabase.from).mockReturnValue({
      select: (...args: any[]) => { fetchChain.select(...args); return fetchChain },
      update: (...args: any[]) => { updateChain.update(...args); return updateChain }
    } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    // The snapshot query starts once the subscription is live and stays pending.
    await waitFor(() => {
      expect(fetchChain.select).toHaveBeenCalled()
    })

    // Two flags land while the snapshot is still in flight.
    act(() => {
      getCardCallback()?.({})
      getCardCallback()?.({})
    })
    await waitFor(() => {
      expect(result.current.alertCount).toBe(2)
    })

    // The snapshot only saw one event: it must not pull the count backward.
    await act(async () => {
      releaseSnapshot({ count: 1, error: null })
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(2)
  })

  it('clears the banner when a dismissal UPDATE arrives and the recount is zero', async () => {
    // Another live tab/device persisted the dismissal; this tab only sees
    // the UPDATE event, so it recounts and finds nothing unresolved.
    const getCardCallback = mockRealtimeChannel()
    const { setCountResult } = mockMutableCountQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    setCountResult({ count: 0, error: null })
    await act(async () => {
      getCardCallback('UPDATE')?.({})
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })

  it('keeps the banner active at the max count when a dismissal UPDATE leaves flags unresolved', async () => {
    const getCardCallback = mockRealtimeChannel()
    const { setCountResult } = mockMutableCountQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    // Two flags were raised since; the recount must not move the tally back.
    setCountResult({ count: 2, error: null })
    await act(async () => {
      getCardCallback('UPDATE')?.({})
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(2)
  })

  it('stays syncable after its own dismissal: a later cross-device dismissal UPDATE clears a re-opened banner', async () => {
    // Tab A: dismiss → a new flag INSERT re-opens the banner → tab B dismisses
    // → tab A must clear via the UPDATE recount. The hook must not latch out
    // UPDATE events for the mount's lifetime after its own dismissal.
    const getCardCallback = mockRealtimeChannel()
    const { setCountResult } = mockMutableCountQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
    })

    await act(async () => {
      await result.current.dismissAlert()
    })
    expect(result.current.alertActive).toBe(false)

    // A fresh flag arrives (INSERT is not gated on the dismissal).
    await act(async () => {
      getCardCallback('INSERT')?.({})
      await Promise.resolve()
    })
    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(1)

    // Tab B dismissed it; the recount sees zero unresolved rows.
    setCountResult({ count: 0, error: null })
    await act(async () => {
      getCardCallback('UPDATE')?.({})
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })

  it('drops a stale in-flight catch-up that completes after a dismissal', async () => {
    // The mount catch-up snapshot the pre-dismissal table state; the GM
    // dismisses before it resolves. Its count must not resurrect the banner
    // over the newer clear (generation token drops the stale writer).
    const { deferNext, flush, setCountResult } = mockMutableCountQuery({ count: 1, error: null })
    mockRealtimeChannel()
    deferNext()

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    // Catch-up is in flight but unresolved: no banner yet.
    await act(async () => { await Promise.resolve() })
    expect(result.current.alertActive).toBe(false)

    await act(async () => {
      await result.current.dismissAlert()
    })
    expect(result.current.alertActive).toBe(false)

    // The stale snapshot lands afterwards claiming 1 unresolved flag.
    setCountResult({ count: 1, error: null })
    await act(async () => {
      flush()
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })

  it('drops a stale UPDATE recount that completes after a live INSERT', async () => {
    // A recount issued before a live flag arrived must not clear the banner
    // with its pre-INSERT zero count after the flag already reopened it.
    const getCardCallback = mockRealtimeChannel()
    const { deferNext, flush, setCountResult } = mockMutableCountQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    // Another device dismisses; this tab's recount is in flight…
    deferNext()
    await act(async () => {
      getCardCallback('UPDATE')?.({})
      await Promise.resolve()
    })
    // …and a fresh flag lands while it is unresolved.
    await act(async () => {
      getCardCallback('INSERT')?.({})
      await Promise.resolve()
    })
    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(2)

    // The stale recount reports the pre-INSERT zero: dropping it keeps the
    // live flag visible (a later event/recount reflects the true state).
    setCountResult({ count: 0, error: null })
    await act(async () => {
      flush()
      await Promise.resolve()
    })

    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(2)
  })

  it('leaves state untouched and skips the toast when the UPDATE recount fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const getCardCallback = mockRealtimeChannel()
    const { setCountResult } = mockMutableCountQuery({ count: 1, error: null })

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    // Transient recount failure: keep the current banner, no toast noise on
    // every event — it self-heals on the next event or reconnect.
    setCountResult({ count: null, error: { message: 'RLS block' } })
    await act(async () => {
      getCardCallback('UPDATE')?.({})
      await Promise.resolve()
    })

    expect(consoleError).toHaveBeenCalled()
    expect(result.current.alertActive).toBe(true)
    expect(result.current.alertCount).toBe(1)
    expect(document.body.textContent).not.toContain('Failed to load X-Card alerts.')
  })
})

function fetchCountCalls(): number {
  return vi.mocked(supabase.from).mock.calls.length
}
