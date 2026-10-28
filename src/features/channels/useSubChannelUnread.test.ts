import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSubChannelUnread } from './useSubChannelUnread'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    removeChannel: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
  },
}))

// Routes get_channel_room_unread to a fixed unread payload and everything else
// to a null-error success, so a single mock serves the fetch and the mark-read.
const mockRpc = (rows: { sub_channel_id: string | null; unread_count: number }[] | null, error: unknown = null) => {
  vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
    if (name === 'get_channel_room_unread') return Promise.resolve({ data: rows, error } as never)
    return Promise.resolve({ data: null, error: null } as never)
  }) as never)
}

const installMessagesHandler = () => {
  let handler: ((payload: unknown) => void) | undefined
  const mockOn = vi.fn().mockImplementation((_event, config, cb) => {
    if (config.table === 'messages') handler = cb
    return { on: mockOn, subscribe: vi.fn().mockImplementation(cb2 => { cb2?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }) }
  })
  vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as never)
  return () => handler
}

describe('useSubChannelUnread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState
  })

  it('returns early with no user or no channel id', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
    const { result } = renderHook(() => useSubChannelUnread('c1', null))
    expect(result.current.counts).toEqual({})
  })

  it('loads per-room counts, keying the Main (NULL) group as main', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([
      { sub_channel_id: null, unread_count: 3 },
      { sub_channel_id: 'r1', unread_count: 2 },
    ])

    const { result } = renderHook(() => useSubChannelUnread('c1', null))

    await waitFor(() => expect(result.current.counts).toEqual({ main: 3, r1: 2 }))
    expect(supabase.rpc).toHaveBeenCalledWith('get_channel_room_unread', { p_channel_id: 'c1' })
  })

  it('increments a non-active room on a live message, skipping own messages', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([{ sub_channel_id: 'r1', unread_count: 0 }])
    const getHandler = installMessagesHandler()

    const { result } = renderHook(() => useSubChannelUnread('c1', null))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('get_channel_room_unread', { p_channel_id: 'c1' }))

    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: 'r1', sender_id: 'u2' } }) })
    expect(result.current.counts.r1).toBe(1)

    // Own message: already read, no dot.
    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: 'r1', sender_id: 'u1' } }) })
    expect(result.current.counts.r1).toBe(1)
  })

  it('lights the Main dot for a message that arrives while the user is in a room', async () => {
    // Opening a room straight from a notification must not hide Main's unread.
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([{ sub_channel_id: null, unread_count: 0 }, { sub_channel_id: 'r1', unread_count: 0 }])
    const getHandler = installMessagesHandler()

    const { result } = renderHook(() => useSubChannelUnread('c1', 'r1'))
    await waitFor(() => expect(result.current.counts).toEqual({ main: 0, r1: 0 }))

    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: null, sender_id: 'u2' } }) })
    expect(result.current.counts.main).toBe(1)

    // Own Main message: already read.
    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: null, sender_id: 'u1' } }) })
    expect(result.current.counts.main).toBe(1)
  })

  it('leaves the Main dot to ChannelView for a message read live in Main', async () => {
    // useChannel writes Main's mark only after history loads; clearing the dot
    // from here could hide unread posts when that fetch failed.
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    mockRpc([{ sub_channel_id: null, unread_count: 2 }, { sub_channel_id: 'r1', unread_count: 0 }])
    const getHandler = installMessagesHandler()

    const { result } = renderHook(() => useSubChannelUnread('c1', null))
    await waitFor(() => expect(result.current.counts.main).toBe(2))

    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: null, sender_id: 'u2' } }) })
    expect(result.current.counts.main).toBe(2)
    expect(supabase.rpc).not.toHaveBeenCalledWith('mark_sub_channel_read', expect.anything())
  })

  it('advances the read mark (not the dot) for a live message in the room being viewed', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    mockRpc([{ sub_channel_id: 'r1', unread_count: 4 }])
    const getHandler = installMessagesHandler()

    const { result } = renderHook(() => useSubChannelUnread('c1', 'r1'))
    await waitFor(() => expect(result.current.counts.r1).toBe(4))

    // A message arrives in the room the user is reading: no dot, and the room's
    // read mark advances so a later reopen does not re-flag it.
    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: 'r1', sender_id: 'u2' } }) })
    expect(result.current.counts.r1).toBe(0)
    expect(supabase.rpc).toHaveBeenCalledWith('mark_sub_channel_read', { p_sub_channel_id: 'r1' })
  })

  it('does not advance the read mark for the active room while the tab is hidden', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    mockRpc([{ sub_channel_id: 'r1', unread_count: 4 }])
    const getHandler = installMessagesHandler()

    const { result } = renderHook(() => useSubChannelUnread('c1', 'r1'))
    await waitFor(() => expect(result.current.counts.r1).toBe(4))

    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: 'r1', sender_id: 'u2' } }) })
    expect(supabase.rpc).not.toHaveBeenCalledWith('mark_sub_channel_read', expect.anything())
    expect(result.current.counts.r1).toBe(4)
  })

  it('markRoomRead clears the room and calls the RPC', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([{ sub_channel_id: 'r1', unread_count: 5 }])

    const { result } = renderHook(() => useSubChannelUnread('c1', null))
    await waitFor(() => expect(result.current.counts.r1).toBe(5))

    await act(async () => { await result.current.markRoomRead('r1') })
    expect(result.current.counts.r1).toBe(0)
    expect(supabase.rpc).toHaveBeenCalledWith('mark_sub_channel_read', { p_sub_channel_id: 'r1' })
  })

  it('markMainRead clears the local Main dot', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([{ sub_channel_id: null, unread_count: 3 }, { sub_channel_id: 'r1', unread_count: 1 }])

    const { result } = renderHook(() => useSubChannelUnread('c1', null))
    await waitFor(() => expect(result.current.counts.main).toBe(3))

    act(() => { result.current.markMainRead() })

    expect(result.current.counts.main).toBe(0)
    // The room dots are untouched.
    expect(result.current.counts.r1).toBe(1)
  })

  it('refetches counts when the tab becomes visible again', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    mockRpc([{ sub_channel_id: 'r1', unread_count: 1 }])

    renderHook(() => useSubChannelUnread('c1', null))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1))

    mockRpc([{ sub_channel_id: 'r1', unread_count: 9 }])
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })
})
