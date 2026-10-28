import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannels } from './useChannels'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'
import { reportRealtimeStatus, clearRealtimeStatus } from '../../lib/realtime'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    // Lobby unread subscription (issue #338): a resubscribing realtime channel.
    channel: vi.fn(() => {
      const chain: any = {
        on: () => chain,
        subscribe: () => undefined,
        unsubscribe: async () => undefined
      }
      return chain
    })
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

// useChannels now runtime-validates rows (issue #338); fill fixture rows with
// the full generated column shape the schema requires.
const validChannel = (over: Record<string, unknown> = {}) => ({
  gm_id: 'gm-1', is_archived: false, game_system: 'none',
  created_at: '2023-01-01T00:00:00Z', last_message_at: null, ...over
})
const validMember = (over: Record<string, unknown> = {}) => ({
  is_active_player: false, is_blocked: false, joined_at: '2023-01-01T00:00:00Z',
  last_read_at: '2023-01-01T00:00:00Z', notify_all_messages: true,
  notify_gm_messages: true, notify_turn: true, ...over
})
const fillRows = (rows: any[]) =>
  rows.map(r => ({ ...validMember(r), channel: validChannel(r.channel) }))

// The Lobby fetches unread counts and per-viewer previews in parallel; route
// each RPC by name so payloads never land on the wrong call.
const mockLobbyRpcs = ({
  unread = [] as any[],
  previews = [] as any[],
  unreadError = null as unknown,
  previewsError = null as unknown,
} = {}) => {
  vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
    if (name === 'get_user_channel_previews') {
      return Promise.resolve({ data: previews, error: previewsError })
    }
    return Promise.resolve({ data: unread, error: unreadError })
  }) as any)
}

// One unread payload per lobby fetch (mount, push refetch, retry).
const mockLobbyRpcQueue = (unreadPayloads: any[][]) => {
  let call = 0
  vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
    if (name === 'get_user_channel_previews') return Promise.resolve({ data: [], error: null })
    const data = unreadPayloads[Math.min(call, unreadPayloads.length - 1)]
    call += 1
    return Promise.resolve({ data, error: null })
  }) as any)
}

describe('useChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
  })

  it('returns empty lists and loading false if no user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as any)
    const { result } = renderHook(() => useChannels())
    expect(result.current.loading).toBe(true)
    expect(result.current.myChannels).toEqual([])
  })

  it('does not fetch while auth is still resolving its session (#315)', async () => {
    // Fresh sign-up race: user object may exist while the auth client is not
    // ready; firing the query then can fail with "Not authenticated" and show
    // the lobby's error banner. The fetch must wait for auth to settle.
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: true } as any)
    const { result, rerender } = renderHook(() => useChannels())
    await new Promise(res => setTimeout(res, 20))
    expect(supabase.from).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()

    // Auth resolves → the fetch fires.
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: [], error: null }) as any
      return {} as any
    })
    mockLobbyRpcs()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    rerender()

    // One channels fetch plus the unread and preview RPCs once auth settles.
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('get_user_channel_previews', { p_user_id: 'user-1' }))
    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(vi.mocked(supabase.from).mock.calls[0][0]).toBe('channel_members')
    expect(supabase.rpc).toHaveBeenCalledWith('get_user_channels_unread', { p_user_id: 'user-1' })
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('does not set state if unmounted during fetch', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
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
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
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

  it('refetch() clears the error and re-runs the fetch (UX-7)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: null, error: new Error('Member DB error') }) as any;
      return {} as any;
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(supabase.from).toHaveBeenCalledTimes(1)

    act(() => { result.current.refetch() })
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(supabase.from).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('clears a stale error when a later automatic fetch succeeds (self-heal, #700)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let failing = true
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        return createChain(failing
          ? { data: null, error: new Error('Member DB error') }
          : { data: fillRows([{ id: 'member-1', channel_id: 'c1', user_id: 'user-1', channel: { id: 'c1', name: 'My Channel' } }]), error: null }) as any
      }
      return {} as any
    })
    mockLobbyRpcs()

    // A service-worker push triggers an immediate (un-throttled) refetch — the
    // same success path the visibilitychange / realtime refetches take.
    let messageHandler: ((event: MessageEvent) => void) | undefined
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => { messageHandler = handler }),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))

    failing = false
    await act(async () => {
      messageHandler?.({ data: { type: 'PUSH_RECEIVED' } } as MessageEvent)
    })

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.myChannels).toHaveLength(1)
  })

  it('retries a failed fetch automatically with backoff so the lobby self-heals (#700)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let calls = 0
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        calls += 1
        return createChain(calls === 1
          ? { data: null, error: new Error('Member DB error') }
          : { data: fillRows([{ id: 'member-1', channel_id: 'c1', user_id: 'user-1', channel: { id: 'c1', name: 'My Channel' } }]), error: null }) as any
      }
      return {} as any
    })
    mockLobbyRpcs()

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))

    // No user action and no external event: the ~1s backoff retry recovers.
    await waitFor(() => expect(result.current.error).toBeNull(), { timeout: 3000 })
    expect(result.current.myChannels).toHaveLength(1)
  })

  it('fetches and formats channels successfully with unread counts', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'channel-2', name: 'My Channel' }
    }]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any;
      return {} as any;
    })
    mockLobbyRpcs({ unread: [{ channel_id: 'channel-2', unread_count: 5 }] })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels[0].unread_count).toBe(5)
    expect(supabase.rpc).toHaveBeenCalledWith('get_user_channels_unread', { p_user_id: 'user-1' })
  })

  it('refreshes unread counts when service worker receives a push', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
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
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any
      return {} as any
    })
    mockLobbyRpcQueue([
      [{ channel_id: 'channel-2', unread_count: 1 }],
      [{ channel_id: 'channel-2', unread_count: 2 }],
    ])

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
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows([{
        id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
        last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'channel-2', name: 'My Channel' }
      }]), error: null }) as any;
      return {} as any;
    })
    mockLobbyRpcs({ unread: [{ channel_id: 'channel-2', unread_count: 3 }] })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels[0].unread_count).toBe(3)
    // The old N+1 per-channel messages queries must be gone.
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('fetches and formats channels successfully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      channel: { id: 'channel-2', name: 'My Channel' }
    }]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any;
      return {} as any;
    })
    mockLobbyRpcs()

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels).toHaveLength(1)
    expect(result.current.myChannels[0].id).toBe('channel-2')
  })

  it('sorts my channels by most recent message, nulls last', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
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
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any;
      return {} as any;
    })
    // Order comes from the per-viewer preview timestamp; c3 has no readable
    // message, so it sorts last despite its newer created_at.
    mockLobbyRpcs({
      previews: [
        { channel_id: 'c1', last_message_at: '2023-01-01T00:00:00Z', last_message_preview: 'A: old' },
        { channel_id: 'c2', last_message_at: '2024-06-01T00:00:00Z', last_message_preview: 'B: recent' },
      ],
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels.map(c => c.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('breaks ties by created_at when last_message_at matches', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
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
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any;
      return {} as any;
    })
    mockLobbyRpcs({
      previews: [
        { channel_id: 'c1', last_message_at: '2024-06-01T00:00:00Z', last_message_preview: 'A: same time' },
        { channel_id: 'c2', last_message_at: '2024-06-01T00:00:00Z', last_message_preview: 'B: same time' },
      ],
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels.map(c => c.id)).toEqual(['c1', 'c2'])
  })

  it('refetches when a realtime message INSERT lands in one of my channels', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'c1', name: 'My Channel' }
    }]
    let messagesInsert: ((payload: any) => void) | undefined
    const channelMock: any = {
      on: (_event: any, filter: any, cb: any) => {
        if (filter.table === 'messages') messagesInsert = cb
        return channelMock
      },
      subscribe: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined)
    }
    vi.mocked(supabase.channel).mockImplementation(() => channelMock as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any
      return {} as any
    })
    mockLobbyRpcQueue([
      [{ channel_id: 'c1', unread_count: 1 }],
      [{ channel_id: 'c1', unread_count: 2 }],
    ])

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.myChannels[0]?.unread_count).toBe(1))

    await act(async () => {
      messagesInsert?.({ new: { channel_id: 'c1' } })
      // A burst of messages in the debounce window costs one refetch.
      messagesInsert?.({ new: { channel_id: 'c1' } })
      messagesInsert?.({ new: { channel_id: 'c1' } })
    })

    // INSERT schedules a trailing 2s-debounced refetch (one per burst).
    await act(async () => { await new Promise(res => setTimeout(res, 2100)) })

    await waitFor(() => expect(result.current.myChannels[0]?.unread_count).toBe(2), { timeout: 4000 })
  })

  it('recognizes an insert that lands between membership resolution and the unread RPC', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'c1', name: 'My Channel' }
    }]
    let messagesInsert: ((payload: any) => void) | undefined
    let resolveUnreadRpc!: (value: { data: { channel_id: string, unread_count: number }[], error: null }) => void
    const channelMock: any = {
      on: (_event: any, filter: any, cb: any) => {
        if (filter.table === 'messages') messagesInsert = cb
        return channelMock
      },
      subscribe: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined)
    }
    vi.mocked(supabase.channel).mockImplementation(() => channelMock as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any
      return {} as any
    })
    // Unread RPC stays pending until after the racing INSERT fires.
    const rpcPromise = new Promise<{ data: { channel_id: string, unread_count: number }[], error: null }>(res => { resolveUnreadRpc = res })
    vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
      if (name === 'get_user_channel_previews') return Promise.resolve({ data: [], error: null })
      return rpcPromise
    }) as any)

    const { result } = renderHook(() => useChannels())
    // Wait until the subscription is wired, then race an INSERT against the
    // still-pending unread RPC — the channel must already be registered.
    await waitFor(() => expect(messagesInsert).toBeDefined())

    await act(async () => {
      messagesInsert?.({ new: { channel_id: 'c1' } })
      resolveUnreadRpc({ data: [{ channel_id: 'c1', unread_count: 1 }], error: null })
      await rpcPromise
    })

    // The INSERT above scheduled a debounced refetch that now sees the channel.
    await act(async () => { await new Promise(res => setTimeout(res, 2100)) })
    expect(result.current.myChannels[0]?.unread_count).toBe(1)
  })

  it('throttles realtime status flaps into a single refetch (ARCH-6)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'c1', name: 'My Channel' }
    }]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any
      return {} as any
    })
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.rpc).mockImplementation(rpc as any)

    const unreadFetches = () => rpc.mock.calls.filter(call => call[0] === 'get_user_channels_unread').length

    const { result, unmount } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const fetchesAfterLoad = unreadFetches()

    // A rapid flap storm: drop, retry, recover — each used to refetch the
    // lobby on its own.
    act(() => {
      reportRealtimeStatus('flap-test', 'CHANNEL_ERROR')
      reportRealtimeStatus('flap-test', 'CHANNEL_ERROR')
      reportRealtimeStatus('flap-test', 'SUBSCRIBED')
    })

    // No immediate refetch — throttled to one per 2s window.
    expect(unreadFetches()).toBe(fetchesAfterLoad)

    await act(async () => { await new Promise(res => setTimeout(res, 2100)) })

    expect(unreadFetches()).toBe(fetchesAfterLoad + 1)
    unmount()
    clearRealtimeStatus('flap-test')
  })

  it('refetches when a message is edited or soft-deleted', async () => {
    // The preview is the last visible message, so an edit or delete of it must
    // refresh the row too, not just new inserts.
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'c1', name: 'My Channel' }
    }]
    let messagesHandler: ((payload: any) => void) | undefined
    const channelMock: any = {
      on: (_event: any, filter: any, cb: any) => {
        if (filter.table === 'messages') messagesHandler = cb
        return channelMock
      },
      subscribe: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined)
    }
    vi.mocked(supabase.channel).mockImplementation(() => channelMock as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any
      return {} as any
    })
    mockLobbyRpcQueue([[{ channel_id: 'c1', unread_count: 1 }], [{ channel_id: 'c1', unread_count: 1 }]])

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.myChannels[0]?.unread_count).toBe(1))
    const before = vi.mocked(supabase.rpc).mock.calls.filter(c => c[0] === 'get_user_channels_unread').length

    await act(async () => {
      messagesHandler?.({ eventType: 'UPDATE', new: { id: 'm1', channel_id: 'c1' } })
    })
    await act(async () => { await new Promise(res => setTimeout(res, 2100)) })

    const after = vi.mocked(supabase.rpc).mock.calls.filter(c => c[0] === 'get_user_channels_unread').length
    expect(after).toBe(before + 1)
  })

  it('ignores realtime message INSERTs for channels I am not in', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'c1', name: 'My Channel' }
    }]
    let messagesInsert: ((payload: any) => void) | undefined
    const channelMock: any = {
      on: (_event: any, filter: any, cb: any) => {
        if (filter.table === 'messages') messagesInsert = cb
        return channelMock
      },
      subscribe: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined)
    }
    vi.mocked(supabase.channel).mockImplementation(() => channelMock as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') return createChain({ data: fillRows(mockMyChannelsRaw), error: null }) as any
      return {} as any
    })
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.rpc).mockImplementation(rpc as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsBefore = rpc.mock.calls.length

    await act(async () => {
      messagesInsert?.({ new: { channel_id: 'other-channel' } })
    })

    expect(rpc.mock.calls.length).toBe(callsBefore)
    expect(result.current.myChannels).toHaveLength(1)
  })

  it('overrides the channel-wide preview with the per-viewer one', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        return createChain({ data: fillRows([{
          id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Hero',
          // Channel-wide column: another member's message, which this viewer
          // cannot necessarily see (whisper / restricted room).
          channel: { id: 'c1', name: 'My Channel', last_message_at: '2026-01-01T00:00:00Z', last_message_preview: 'Hero: someone else wrote this' },
        }]), error: null }) as any
      }
      return {} as any
    })
    mockLobbyRpcs({
      previews: [{
        channel_id: 'c1',
        last_message_at: '2025-12-31T00:00:00Z',
        last_message_preview: 'Battle · Hero: the last thing I can see',
      }],
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.myChannels[0].last_message_preview).toBe('Battle · Hero: the last thing I can see')
    expect(result.current.myChannels[0].last_message_at).toBe('2025-12-31T00:00:00Z')
    expect(supabase.rpc).toHaveBeenCalledWith('get_user_channel_previews', { p_user_id: 'user-1' })
  })

  it('sorts by the per-viewer timestamp, not the shared channel one', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        return createChain({ data: fillRows([
          {
            id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'A',
            channel: { id: 'c1', name: 'Hidden Activity', created_at: '2023-01-01T00:00:00Z', last_message_at: '2026-01-02T00:00:00Z' },
          },
          {
            id: 'member-2', channel_id: 'c2', user_id: 'user-1', character_name: 'B',
            channel: { id: 'c2', name: 'Visible Activity', created_at: '2023-01-01T00:00:00Z', last_message_at: '2026-01-01T00:00:00Z' },
          },
        ]), error: null }) as any
      }
      return {} as any
    })
    mockLobbyRpcs({
      previews: [
        { channel_id: 'c1', last_message_at: '2024-01-01T00:00:00Z', last_message_preview: 'A: older' },
        { channel_id: 'c2', last_message_at: '2026-01-01T00:00:00Z', last_message_preview: 'B: newer' },
      ],
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels.map(c => c.id)).toEqual(['c2', 'c1'])
  })

  it('shows no preview for a channel the previews RPC omits', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        return createChain({ data: fillRows([{
          id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Hero',
          channel: { id: 'c1', name: 'Hidden Only', last_message_at: '2026-01-01T00:00:00Z', last_message_preview: 'secret room content' },
        }]), error: null }) as any
      }
      return {} as any
    })
    mockLobbyRpcs({ previews: [] })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels[0].last_message_preview).toBeNull()
    expect(result.current.myChannels[0].last_message_at).toBeNull()
  })

  it('retries the previews read once before giving up', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        return createChain({ data: fillRows([{
          id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Hero',
          channel: { id: 'c1', name: 'My Channel' },
        }]), error: null }) as any
      }
      return {} as any
    })
    let previewsCalls = 0
    vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
      if (name === 'get_user_channel_previews') {
        previewsCalls += 1
        if (previewsCalls === 1) {
          return Promise.resolve({ data: null, error: new Error('timeout') })
        }
        return Promise.resolve({ data: [{ channel_id: 'c1', last_message_at: '2026-01-01T00:00:00Z', last_message_preview: 'Hero: back online' }], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(previewsCalls).toBe(2)
    expect(result.current.myChannels[0].last_message_preview).toBe('Hero: back online')
  })

  it('keeps the lobby usable when the previews RPC fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' }, loading: false } as any)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channel_members') {
        return createChain({ data: fillRows([{
          id: 'member-1', channel_id: 'c1', user_id: 'user-1', character_name: 'Hero',
          channel: { id: 'c1', name: 'My Channel' },
        }]), error: null }) as any
      }
      return {} as any
    })
    mockLobbyRpcs({ unread: [{ channel_id: 'c1', unread_count: 2 }], previewsError: new Error('previews down') })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.myChannels).toHaveLength(1)
    expect(result.current.myChannels[0].unread_count).toBe(2)
    expect(result.current.myChannels[0].last_message_preview).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})
