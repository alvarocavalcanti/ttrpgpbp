import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChannel } from './useChannel'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    removeChannel: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    })
  }
}))

describe('useChannel', () => {
  const mockSecret = (data: { gm_only_resources_url: string | null } | null = null) => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error: null })
    const mockEqSecrets = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelectSecrets = vi.fn().mockReturnValue({ eq: mockEqSecrets })
    return { select: mockSelectSecrets }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Tests that override visibilityState define it as an own property on the
  // document instance; deleting it restores the prototype getter for later
  // suites.
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState
  })

  it('returns early if no user or no channel id', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    
    const { result } = renderHook(() => useChannel('123'))
    
    expect(result.current.loading).toBe(false)
    expect(result.current.channel).toBeNull()
  })

  it('fetches channel and members', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.channel).toEqual(mockChannel)
    expect(result.current.members[0].profile?.display_name).toBe('Hero')
    expect(result.current.isGM).toBe(true)
    expect(result.current.myMemberInfo).toBeDefined()
    expect(result.current.gmOnlyResourcesUrl).toBeNull()
  })

  it('exposes gm_only_resources_url from channel_secrets for the GM', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    const mockSecretData = { gm_only_resources_url: 'https://gm.secret' }

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret(mockSecretData) as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.gmOnlyResourcesUrl).toBe('https://gm.secret')
  })

  it('handles error gracefully when members fetch fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: null, error: new Error('Member DB Error') })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(console.error).toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
  })

  it('handles error gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    vi.mocked(supabase.from).mockReturnValue({ select: mockSelectChannel } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(console.error).toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
  })

  it('handles last_read_at update failure gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })
    
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: new Error('Update failed') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') {
        return { 
          select: mockSelectMembers,
          update: mockUpdate
        } as any
      }
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to update last_read_at', expect.any(Error))
    })
  })

  it('calls onRead after a successful last_read_at update', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const onRead = vi.fn()
    renderHook(() => useChannel('c1', onRead))

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledTimes(1)
    })
  })

  it('advances last_read_at when a message arrives while the channel is visible', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockImplementation(cb => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } })
    let messagesInsert: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'messages' && config.event === 'INSERT') messagesInsert = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const onRead = vi.fn()
    renderHook(() => useChannel('c1', onRead))

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledTimes(1)
    })

    // A message arrives while the user sits in the channel: the persisted read
    // mark advances so the Lobby badge won't re-count it.
    await act(async () => {
      messagesInsert({ eventType: 'INSERT', new: { id: 'x1', channel_id: 'c1' } })
    })

    expect(mockUpdate).toHaveBeenCalledWith({ last_read_at: expect.any(String) })
    expect(onRead).toHaveBeenCalledTimes(2)
  })

  it('keeps last_read_at monotonic when writes are initiated back to back', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    // First write (initial) hangs; the message INSERT write must queue behind
    // it instead of racing it.
    let resolveFirst!: (v: { error: null }) => void
    const firstWrite = new Promise<{ error: null }>(resolve => { resolveFirst = resolve })
    const mockEqUpdate = vi.fn()
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValueOnce({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockImplementation(cb => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } })
    let messagesInsert: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'messages' && config.event === 'INSERT') messagesInsert = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    // Message arrives while the first (slow) write is still in flight.
    await act(async () => {
      messagesInsert({ eventType: 'INSERT', new: { id: 'x1', channel_id: 'c1' } })
      await Promise.resolve()
    })
    expect(mockUpdate).toHaveBeenCalledTimes(1)

    // First write completes; only then does the queued write run — with a
    // later timestamp, so the stored value can never move backward.
    await act(async () => {
      resolveFirst({ error: null })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    const [firstTs, secondTs] = mockUpdate.mock.calls.map(c => (c[0] as { last_read_at: string }).last_read_at)
    expect(new Date(secondTs).getTime()).toBeGreaterThanOrEqual(new Date(firstTs).getTime())
  })

  it('does not advance last_read_at from message events while the tab is hidden', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    // Mount visible so the initial mark-read runs, then go hidden: arriving
    // message events must not advance the read mark.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockImplementation(cb => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } })
    let messagesInsert: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'messages' && config.event === 'INSERT') messagesInsert = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    // Tab goes hidden before the message arrives.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })

    await act(async () => {
      messagesInsert({ eventType: 'INSERT', new: { id: 'x1', channel_id: 'c1' } })
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not mark read when a reconnect completes while the tab is hidden', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockImplementation(cb => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } })
    let statusCb: ((status: string) => void) | undefined
    const mockOn = vi.fn().mockImplementation(() => ({ on: mockOn, subscribe: mockSubscribe }))
    vi.mocked(supabase.channel).mockImplementation(() => {
      const on = vi.fn().mockReturnThis()
      return { on, subscribe: (cb: (status: string) => void) => { statusCb = cb; cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } } } as unknown as RealtimeChannel
    })

    renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    // Tab hidden when the socket drops and the retry reconnects.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      statusCb?.('CHANNEL_ERROR')
      statusCb?.('SUBSCRIBED')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it('handles realtime updates', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1', status_text: 'Old' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', is_active_player: false, profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    let channelCallback: any
    let membersCallback: any

    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'channels') {
        channelCallback = callback
      } else if (config.table === 'channel_members') {
        membersCallback = callback
      }
      return { on: mockOn, subscribe: mockSubscribe }
    })

    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Simulate channel update
    import('react').then(React => {
        const { act } = React
        act(() => {
          // Realtime UPDATE payloads carry the full row, id included.
          channelCallback({ new: { id: 'c1', status_text: 'New' } })
          membersCallback({ new: { id: 'm1', user_id: 'u1', is_active_player: true } })
        })
    })

    await waitFor(() => {
        expect(result.current.channel?.status_text).toBe('New')
        expect(result.current.members[0].is_active_player).toBe(true)
    })
  })

  it('refetches members on realtime INSERT', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const initialMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]
    const afterJoin = [...initialMembers, { id: 'm2', user_id: 'u2', profile: { display_name: 'Newbie' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn()
      .mockResolvedValueOnce({ data: initialMembers, error: null })
      .mockResolvedValueOnce({ data: afterJoin, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    let membersCallback: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'channel_members') membersCallback = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.members).toHaveLength(1)

    // A new player joins; the profile join is picked up by the refetch.
    await act(async () => {
      membersCallback({ eventType: 'INSERT', new: { id: 'm2', user_id: 'u2' }, old: null })
    })

    await waitFor(() => {
      expect(result.current.members).toHaveLength(2)
    })
    expect(result.current.members[1].profile?.display_name).toBe('Newbie')
  })

  it('keeps the read boundary frozen when a last_read_at echo arrives', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    let membersCallback: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'channel_members') membersCallback = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.lastReadAt).toBe('2023-01-01T12:00:00Z')

    // Our own last_read_at write echoes back as a realtime UPDATE. The divider
    // boundary must not follow it to "now", or the new-messages divider is hidden.
    await act(async () => {
      membersCallback({ eventType: 'UPDATE', new: { id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T18:00:00Z' }, old: null })
    })

    expect(result.current.myMemberInfo?.last_read_at).toBe('2023-01-01T18:00:00Z')
    expect(result.current.lastReadAt).toBe('2023-01-01T12:00:00Z')
  })

  it('keeps the read boundary frozen when a members refetch picks up the echoed last_read_at', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const initialMembers = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]
    const afterJoin = [
      { id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T18:00:00Z', profile: { display_name: 'Hero' } },
      { id: 'm2', user_id: 'u2', profile: { display_name: 'Newbie' } }
    ]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn()
      .mockResolvedValueOnce({ data: initialMembers, error: null })
      .mockResolvedValueOnce({ data: afterJoin, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    let membersCallback: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'channel_members') membersCallback = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.lastReadAt).toBe('2023-01-01T12:00:00Z')

    await act(async () => {
      membersCallback({ eventType: 'INSERT', new: { id: 'm2', user_id: 'u2' }, old: null })
    })

    await waitFor(() => {
      expect(result.current.members).toHaveLength(2)
    })
    expect(result.current.lastReadAt).toBe('2023-01-01T12:00:00Z')
  })

  it('uses an echoed last_read_at when no boundary was captured (not a member)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u2', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.lastReadAt).toBeNull()
    expect(result.current.myMemberInfo).toBeUndefined()
  })

  it('clears previous channel state when switching channels', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const c1 = { id: 'c1', gm_id: 'u1' }
    const c1members = [{ id: 'm1', user_id: 'u1', last_read_at: '2023-01-01T12:00:00Z', profile: { display_name: 'Hero' } }]
    const c2 = { id: 'c2', gm_id: 'u1' }
    const c2members = [{ id: 'm2', user_id: 'u1', last_read_at: '2023-01-01T09:00:00Z', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: c1, error: null })
      .mockResolvedValueOnce({ data: c2, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn()
      .mockResolvedValueOnce({ data: c1members, error: null })
      .mockResolvedValueOnce({ data: c2members, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers, update: mockUpdate } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const { result, rerender } = renderHook(({ id }) => useChannel(id), { initialProps: { id: 'c1' } })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.channel?.id).toBe('c1')
    expect(result.current.lastReadAt).toBe('2023-01-01T12:00:00Z')

    rerender({ id: 'c2' })

    await waitFor(() => {
      expect(result.current.channel?.id).toBe('c2')
    })
    expect(result.current.lastReadAt).toBe('2023-01-01T09:00:00Z')
    expect(result.current.members.some(m => m.id === 'm1')).toBe(false)
  })

  it('removes a member on realtime DELETE', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [
      { id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } },
      { id: 'm2', user_id: 'u2', profile: { display_name: 'Newbie' } }
    ]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      if (table === 'channel_secrets') return mockSecret() as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    let membersCallback: any
    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'channel_members') membersCallback = callback
      return { on: mockOn, subscribe: mockSubscribe }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.members).toHaveLength(2)

    // A player is kicked; their member row disappears for every client.
    await act(async () => {
      membersCallback({ eventType: 'DELETE', new: null, old: { id: 'm2' } })
    })

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1)
      expect(result.current.members[0].user_id).toBe('u1')
    })
  })
})
