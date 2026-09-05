import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRollHistory } from './useRollHistory'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    removeChannel: vi.fn(),
    channel: vi.fn()
  }
}))

const validRoll = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  roller_id: 'u1',
  notation: '1d20+5',
  result: 23,
  breakdown: { rolls: [18], dropped: [], modifier: 5 },
  created_at: '2026-01-01T00:00:00.000Z',
  roller_display_name: 'Hero',
  ...over
})

function mockChannel(onMock?: (...args: unknown[]) => unknown) {
  const on = onMock ?? vi.fn()
  const channel: any = {
    on: (...args: unknown[]) => {
      on(...args)
      return channel
    },
    subscribe: vi.fn(),
    unsubscribe: vi.fn().mockResolvedValue(undefined)
  }
  vi.mocked(supabase.channel).mockReturnValue(channel as any)
  return channel
}

describe('useRollHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the roll history via the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [validRoll()], error: null } as any)
    mockChannel()

    const { result } = renderHook(() => useRollHistory('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledWith('get_channel_roll_history', { p_channel_id: 'c1' })
    expect(result.current.rolls).toHaveLength(1)
    expect(result.current.rolls[0].roller).toEqual({ display_name: 'Hero' })
    expect(result.current.error).toBeNull()
  })

  it('renders an error state when the RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('DB error') } as any)
    mockChannel()

    const { result } = renderHook(() => useRollHistory('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load roll history.')
  })

  it('errors instead of rendering invalid row data', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ id: 'bad', notation: 123 }], error: null } as any)
    mockChannel()

    const { result } = renderHook(() => useRollHistory('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load roll history.')
    expect(result.current.rolls).toEqual([])
  })

  it('skips a malformed realtime INSERT row instead of crashing', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    const onMock = vi.fn()
    mockChannel(onMock)

    const { result } = renderHook(() => useRollHistory('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertCb = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')![2] as any
    await insertCb({ new: { id: 'x', notation: 123 } })

    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
    expect(result.current.rolls).toEqual([])
  })

  it('appends a valid realtime INSERT row with the roller profile', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { display_name: 'Foo' }, error: null })
        })
      })
    } as any)
    const onMock = vi.fn()
    mockChannel(onMock)

    const { result } = renderHook(() => useRollHistory('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertCb = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')![2] as any
    await insertCb({
      new: {
        id: 'r2',
        roller_id: 'u2',
        notation: '1d6',
        result: 4,
        breakdown: { rolls: [4] },
        created_at: '2026-01-02T00:00:00.000Z'
      }
    })

    await waitFor(() => {
      expect(result.current.rolls).toHaveLength(1)
      expect(result.current.rolls[0].roller).toEqual({ display_name: 'Foo' })
      expect(result.current.rolls[0].id).toBe('r2')
    })
  })

  it('ignores a duplicate realtime INSERT for a roll already loaded', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [validRoll()], error: null } as any)
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { display_name: 'Hero' }, error: null })
        })
      })
    } as any)
    const onMock = vi.fn()
    mockChannel(onMock)

    const { result } = renderHook(() => useRollHistory('c1'))
    await waitFor(() => expect(result.current.rolls).toHaveLength(1))

    const insertCb = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')![2] as any
    await insertCb({ new: validRoll({ roller_display_name: undefined }) })

    expect(result.current.rolls).toHaveLength(1)
  })

  it('subscribes to the channel-scoped dice_rolls table and unsubscribes on unmount', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    const onMock = vi.fn()
    mockChannel(onMock)

    const { unmount } = renderHook(() => useRollHistory('c1'))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())

    const call = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')
    expect(call?.[1]).toMatchObject({ event: 'INSERT', table: 'dice_rolls', filter: 'channel_id=eq.c1' })

    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })

  it('refetches when the realtime subscription recovers after a drop', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [validRoll()], error: null } as any)
      .mockResolvedValueOnce({ data: [validRoll({ id: 'r2', created_at: '2026-01-02T00:00:00.000Z' })], error: null } as any)
    const channel = mockChannel()

    const { result } = renderHook(() => useRollHistory('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rolls).toHaveLength(1)

    // Drive the subscribe status callback: initial SUBSCRIBED (no refetch),
    // a drop, then a recovered resubscribe that reconciles with the server.
    const statusCb = channel.subscribe.mock.calls[0][0]
    act(() => { statusCb('SUBSCRIBED') })
    act(() => { statusCb('CHANNEL_ERROR') })
    act(() => { statusCb('SUBSCRIBED') })

    await waitFor(() => expect(result.current.rolls).toHaveLength(2))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('drops a realtime roll from the old channel whose profile resolves after a switch', async () => {
    const newChannelRoll = validRoll({ id: 'r-new', created_at: '2026-01-03T00:00:00.000Z' })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [], error: null } as any)
      .mockResolvedValueOnce({ data: [newChannelRoll], error: null } as any)

    // The old channel's realtime roll gets stuck fetching its profile.
    let resolveProfile!: (v: { data: unknown, error: null }) => void
    const slowProfile = new Promise<{ data: unknown, error: null }>(res => { resolveProfile = res })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue(slowProfile)
        })
      })
    } as any)

    const onMock = vi.fn()
    mockChannel(onMock)

    const { result, rerender } = renderHook(({ id }: { id: string }) => useRollHistory(id), {
      initialProps: { id: 'c1' }
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // A roll lands on the old channel; its profile fetch hangs. Fire without
    // awaiting — the callback suspends on the deferred profile promise.
    const oldInsertCb = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')![2] as any
    void oldInsertCb({
      new: {
        id: 'r-old',
        roller_id: 'u1',
        notation: '1d20',
        result: 9,
        breakdown: { rolls: [9] },
        created_at: '2026-01-02T00:00:00.000Z'
      }
    })

    // Channel switch unmounts the old effect while the profile fetch pends.
    rerender({ id: 'c2' })
    await waitFor(() => {
      expect(result.current.rolls.map(r => r.id)).toEqual(['r-new'])
    })

    await act(async () => {
      resolveProfile({ data: { display_name: 'Old Channel Roller' }, error: null })
    })

    // The stale roll must not prepend into the new channel's history.
    expect(result.current.rolls.map(r => r.id)).toEqual(['r-new'])
  })
})

