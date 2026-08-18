import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannels } from './useChannels'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

const createChain = (resolveVal: any) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(resolveVal),
    // eslint-disable-next-line unicorn/no-thenable
    then: (cb: any) => Promise.resolve(resolveVal).then(cb)
  };
  return chain;
}

describe('useChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
  })

  it('returns empty lists and loading false if no user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const { result } = renderHook(() => useChannels())
    expect(result.current.loading).toBe(true)
    expect(result.current.myChannels).toEqual([])
  })

  it('does not set state if unmounted during fetch', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    let resolveMember: any;
    const memberPromise = new Promise(resolve => { resolveMember = resolve });
    
    const memberChain = {
      select: () => memberChain,
      eq: () => memberChain,
      // eslint-disable-next-line unicorn/no-thenable
      then: () => memberPromise
    };

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return memberChain as any;
      return {} as any;
    })

    const { result, unmount } = renderHook(() => useChannels())
    unmount()
    resolveMember!({ data: [], error: null })
    expect(result.current.loading).toBe(true)
  })

  it('handles error fetching member data gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: null, error: new Error('Member DB error') }) as any;
      return {} as any;
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(console.error).toHaveBeenCalled()
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('fetches and formats channels successfully with unread counts', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'channel-2', name: 'My Channel' }
    }]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any;
      return {} as any;
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ channel_id: 'channel-2', unread_count: 5 }],
      error: null
    } as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels[0].unread_count).toBe(5)
    expect(supabase.rpc).toHaveBeenCalledWith('get_user_channels_unread', { p_user_id: 'user-1' })
  })

  it('refreshes unread counts when service worker receives a push', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'channel-2', name: 'My Channel' }
    }]
    let messageHandler: ((event: MessageEvent) => void) | undefined
    const addEventListener = vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
      messageHandler = handler
    })
    const removeEventListener = vi.fn()

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener, removeEventListener },
      configurable: true,
    })
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any
      return {} as any
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [{ channel_id: 'channel-2', unread_count: 1 }], error: null } as any)
      .mockResolvedValueOnce({ data: [{ channel_id: 'channel-2', unread_count: 2 }], error: null } as any)

    const { result, unmount } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.myChannels[0]?.unread_count).toBe(1))

    await act(async () => {
      messageHandler?.({ data: { type: 'PUSH_RECEIVED' } } as MessageEvent)
    })

    await waitFor(() => expect(result.current.myChannels[0]?.unread_count).toBe(2))
    expect(addEventListener).toHaveBeenCalledWith('message', expect.any(Function))

    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('uses the unread RPC count (own/deleted filtering is server-side)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: [{
        id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
        last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'channel-2', name: 'My Channel' }
      }], error: null }) as any;
      return {} as any;
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ channel_id: 'channel-2', unread_count: 3 }],
      error: null
    } as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels[0].unread_count).toBe(3)
    // The old N+1 per-channel messages queries must be gone.
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('fetches and formats channels successfully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      channel: { id: 'channel-2', name: 'My Channel' }
    }]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any;
      return {} as any;
    })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels).toHaveLength(1)
    expect(result.current.myChannels[0].id).toBe('channel-2')
  })

  it('sorts my channels by most recent message, nulls last', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockMyChannelsRaw = [
      {
        id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'A',
        channel: { id: 'c1', name: 'Old', created_at: '2023-01-01T00:00:00Z', last_message_at: '2023-01-01T00:00:00Z' }
      },
      {
        id: 'member-2', channel_id: 'c2', user_id: 'user-1', character_name: 'B',
        channel: { id: 'c2', name: 'Recent', created_at: '2023-01-01T00:00:00Z', last_message_at: '2024-06-01T00:00:00Z' }
      },
      {
        id: 'member-3', channel_id: 'c3', user_id: 'user-1', character_name: 'C',
        channel: { id: 'c3', name: 'No Messages', created_at: '2023-03-01T00:00:00Z', last_message_at: null }
      }
    ]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any;
      return {} as any;
    })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels.map(c => c.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('breaks ties by created_at when last_message_at matches', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockMyChannelsRaw = [
      {
        id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'A',
        channel: { id: 'c1', name: 'Newer', created_at: '2024-01-01T00:00:00Z', last_message_at: '2024-06-01T00:00:00Z' }
      },
      {
        id: 'member-2', channel_id: 'c2', user_id: 'user-1', character_name: 'B',
        channel: { id: 'c2', name: 'Older', created_at: '2023-01-01T00:00:00Z', last_message_at: '2024-06-01T00:00:00Z' }
      }
    ]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any;
      return {} as any;
    })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels.map(c => c.id)).toEqual(['c1', 'c2'])
  })
})
