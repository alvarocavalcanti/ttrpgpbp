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

  it('loads per-room counts and ignores the Main (NULL) group', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([
      { sub_channel_id: null, unread_count: 3 },
      { sub_channel_id: 'r1', unread_count: 2 },
    ])

    const { result } = renderHook(() => useSubChannelUnread('c1', null))

    await waitFor(() => expect(result.current.counts).toEqual({ r1: 2 }))
    expect(supabase.rpc).toHaveBeenCalledWith('get_channel_room_unread', { p_channel_id: 'c1' })
  })

  it('increments a non-active room on a live message, skipping own/Main/active', async () => {
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

    // Main message: no room dot.
    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: null, sender_id: 'u2' } }) })
    expect(result.current.counts.r1).toBe(1)
  })

  it('skips the room the user is currently viewing', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    mockRpc([{ sub_channel_id: 'r1', unread_count: 4 }])
    const getHandler = installMessagesHandler()

    const { result } = renderHook(() => useSubChannelUnread('c1', 'r1'))
    await waitFor(() => expect(result.current.counts.r1).toBe(4))

    await act(async () => { getHandler()?.({ eventType: 'INSERT', new: { sub_channel_id: 'r1', sender_id: 'u2' } }) })
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
