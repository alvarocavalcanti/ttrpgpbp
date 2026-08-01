import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMessages } from './useMessages'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn()
  }
}))

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
  })

  it('returns early if no channelId', () => {
    const { result } = renderHook(() => useMessages(undefined))
    expect(result.current.loading).toBe(false)
  })

  it('fetches messages and subscribes', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: 'm1', sender: [{ display_name: 'Hero' }] }], error: null })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    
    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.messages[0].sender?.display_name).toBe('Hero')
    })

    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('handles fetch error gracefully', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    
    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('handles realtime INSERT with joins', async () => {
    let realtimeCallback: any
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    
    const mockSingleJoin = vi.fn().mockResolvedValue({ data: { id: 'm3', sender: { display_name: 'JoinedUser' } } })

    vi.mocked(supabase.from).mockImplementation((_table: string) => {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder, single: mockSingleJoin }) }) } as any
    })
    
    const mockOn = vi.fn().mockImplementation((_event, _filter, callback) => {
      realtimeCallback = callback
      return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Trigger INSERT with sender_id which forces a join fetch
    await act(async () => {
      await realtimeCallback({ eventType: 'INSERT', new: { id: 'm3', sender_id: 'u2' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].sender?.display_name).toBe('JoinedUser')
  })

  it('handles realtime INSERT with joins when data is null', async () => {
    let realtimeCallback: any
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    
    // Simulate failing join
    const mockSingleJoin = vi.fn().mockResolvedValue({ data: null })

    vi.mocked(supabase.from).mockImplementation((_table: string) => {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder, single: mockSingleJoin }) }) } as any
    })
    
    const mockOn = vi.fn().mockImplementation((_event, _filter, callback) => {
      realtimeCallback = callback
      return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await realtimeCallback({ eventType: 'INSERT', new: { id: 'm3', sender_id: 'u2' } })
    })

    // Should not have inserted it since the join fetch returned null
    expect(result.current.messages).toHaveLength(0)
  })

  it('handles realtime INSERT without joins', async () => {
    let realtimeCallback: any
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    
    const mockOn = vi.fn().mockImplementation((_event, _filter, callback) => {
      realtimeCallback = callback
      return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Trigger INSERT
    await act(async () => {
      await realtimeCallback({ eventType: 'INSERT', new: { id: 'm2', content: 'system msg' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('m2')
  })

  it('handles realtime UPDATE and DELETE', async () => {
    let realtimeCallback: any
    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: 'm1', content: 'hello' }], error: null })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    
    const mockOn = vi.fn().mockImplementation((_event, _filter, callback) => {
      realtimeCallback = callback
      return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // UPDATE
    await act(async () => {
      await realtimeCallback({ eventType: 'UPDATE', new: { id: 'm1', content: 'edited' } })
    })

    expect(result.current.messages[0].content).toBe('edited')

    // DELETE
    await act(async () => {
      await realtimeCallback({ eventType: 'DELETE', old: { id: 'm1' } })
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('allows sending, editing, deleting', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })
    
    // For the initial fetch
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEqFetch = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqFetch })

    vi.mocked(supabase.from).mockImplementation((_table: string) => {
      return { select: mockSelect, insert: mockInsert, update: mockUpdate } as any
    })
    
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'test', type: 'regular' })
    })
    expect(mockInsert).toHaveBeenCalled()

    await act(async () => {
      await result.current.editMessage('m1', 'new test')
    })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ content: 'new test' }))

    await act(async () => {
      await result.current.deleteMessage('m1')
    })
    expect(mockUpdate).toHaveBeenCalledWith({ is_deleted: true })
  })

  it('updates active_player_ids when sending a message', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockEqReset = vi.fn().mockResolvedValue({ error: null })
    const mockEqSet = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
    const mockUpdate = vi.fn().mockImplementation((payload) => {
      if (payload.is_active_player === false) {
        return { eq: mockEqReset }
      }
      return { eq: mockEqSet }
    })
    
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEqFetch = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqFetch })

    vi.mocked(supabase.from).mockImplementation((_table: string) => {
      return { select: mockSelect, insert: mockInsert, update: mockUpdate } as any
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Send with active_player_ids
    await act(async () => {
      await result.current.sendMessage({ content: 'test', type: 'regular', active_player_ids: ['u2'] })
    })

    // Expect reset query (is_active_player: false) to be called
    expect(mockUpdate).toHaveBeenCalledWith({ is_active_player: false })
    // Expect set query (is_active_player: true) to be called
    expect(mockUpdate).toHaveBeenCalledWith({ is_active_player: true })
  })
})
