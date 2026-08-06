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
    channel: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ error: null })
    }
  }
}))

// Builds a mock `from()` chain. For 'messages' it uses fetchBuilder, for
// 'message_reactions' it returns an empty list (override with reactionsBuilder).
function mockFrom({
  fetchBuilder = () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
  reactionsBuilder = () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
  tableHandler,
}: {
  fetchBuilder?: () => any
  reactionsBuilder?: () => any
  tableHandler?: (table: string) => any
} = {}) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (tableHandler) return tableHandler(table)
    if (table === 'message_reactions') return { select: reactionsBuilder } as any
    return { select: fetchBuilder } as any
  })
}

// Captures the realtime callback for the messages channel (the first channel).
function mockChannels() {
  const callbacks: Record<string, any> = {}
  vi.mocked(supabase.channel).mockImplementation((name: string) => {
    return {
      on: vi.fn().mockImplementation((_event: any, _filter: any, callback: any) => {
        callbacks[name] = callback
        return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
      })
    } as any
  })
  return callbacks
}

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
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.messages[0].sender?.display_name).toBe('Hero')
    })

    expect(callbacks['messages:c1']).toBeDefined()
    expect(callbacks['reactions:c1']).toBeDefined()
  })

  it('handles fetch error gracefully', async () => {
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }) }) })
    })
    mockChannels()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('handles realtime INSERT with joins', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockSingleJoin = vi.fn().mockResolvedValue({ data: { id: 'm3', sender: { display_name: 'JoinedUser' } } })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: mockOrder, single: mockSingleJoin }) })
    })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages:c1']({ eventType: 'INSERT', new: { id: 'm3', sender_id: 'u2' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].sender?.display_name).toBe('JoinedUser')
  })

  it('handles realtime INSERT with joins when data is null', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockSingleJoin = vi.fn().mockResolvedValue({ data: null })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: mockOrder, single: mockSingleJoin }) })
    })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages:c1']({ eventType: 'INSERT', new: { id: 'm3', sender_id: 'u2' } })
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('handles realtime INSERT without joins', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages:c1']({ eventType: 'INSERT', new: { id: 'm2', content: 'system msg' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('m2')
  })

  it('handles realtime UPDATE and DELETE', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: 'm1', content: 'hello' }], error: null })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages:c1']({ eventType: 'UPDATE', new: { id: 'm1', content: 'edited' } })
    })

    expect(result.current.messages[0].content).toBe('edited')

    await act(async () => {
      await callbacks['messages:c1']({ eventType: 'DELETE', old: { id: 'm1' } })
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('allows sending, editing, deleting', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, update: mockUpdate, select: () => ({ eq: () => ({ order: mockOrder }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

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

  it('sends reply_to when replying', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'reply', type: 'regular', reply_to: 'm1', mention_user_ids: ['u2'] })
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reply_to: 'm1' }))
    expect(supabase.functions.invoke).toHaveBeenCalledWith('push-notifications', expect.objectContaining({
      body: expect.objectContaining({ record: expect.objectContaining({ mention_user_ids: ['u2'] }) })
    }))
  })

  it('handles reactions fetch error without failing the view', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      reactionsBuilder: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error('Reactions DB Error') }) })
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(console.error).toHaveBeenCalledWith('Error fetching reactions:', expect.any(Error))
    })
    // Channel-level error must NOT be set (would redirect away from the view)
    expect(result.current.error).toBeNull()
  })

  it('fetches reactions and builds summaries', async () => {
    const reactionsData = [
      { id: 'r1', message_id: 'm1', channel_id: 'c1', user_id: 'u1', emoji: '👍', created_at: '' },
      { id: 'r2', message_id: 'm1', channel_id: 'c1', user_id: 'u2', emoji: '👍', created_at: '' },
      { id: 'r3', message_id: 'm1', channel_id: 'c1', user_id: 'u2', emoji: '🔥', created_at: '' },
    ]
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      reactionsBuilder: () => ({ eq: vi.fn().mockResolvedValue({ data: reactionsData, error: null }) })
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.reactions['m1']).toHaveLength(2)
    })

    const thumbsUp = result.current.reactions['m1'].find(r => r.emoji === '👍')
    expect(thumbsUp).toMatchObject({ count: 2, hasReacted: true })
    const fire = result.current.reactions['m1'].find(r => r.emoji === '🔥')
    expect(fire).toMatchObject({ count: 1, hasReacted: false })
  })

  it('updates reactions on realtime INSERT and DELETE', async () => {
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) })
    })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['reactions:c1']({ eventType: 'INSERT', new: { id: 'r1', message_id: 'm1', channel_id: 'c1', user_id: 'u2', emoji: '👍' } })
    })
    expect(result.current.reactions['m1']).toEqual([{ emoji: '👍', count: 1, hasReacted: false }])

    await act(async () => {
      await callbacks['reactions:c1']({ eventType: 'DELETE', old: { id: 'r1', message_id: 'm1', channel_id: 'c1', user_id: 'u2', emoji: '👍' } })
    })
    expect(result.current.reactions['m1']).toBeUndefined()
  })

  it('adds and removes reactions', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockMatchDelete = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ match: mockMatchDelete })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'message_reactions') return { insert: mockInsert, delete: mockDelete, select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return { select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
      }
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addReaction('m1', '👍')
    })
    expect(mockInsert).toHaveBeenCalledWith({ message_id: 'm1', channel_id: 'c1', user_id: 'u1', emoji: '👍' })

    await act(async () => {
      await result.current.removeReaction('m1', '👍')
    })
    expect(mockDelete).toHaveBeenCalled()
    expect(mockMatchDelete).toHaveBeenCalledWith({ message_id: 'm1', user_id: 'u1', emoji: '👍' })
  })

  it('catches push-notification edge function error on sendMessage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Edge Error'))

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'Hello', type: 'regular' })
    })

    expect(console.error).toHaveBeenCalledWith('Failed to trigger push for message', expect.any(Error))
  })

  it('catches push-notification edge function error on sendDiceRoll', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockSelectMsg = vi.fn().mockResolvedValue({ data: { id: 'm1' }, error: null })
    const mockInsertMsg = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSelectMsg }) })
    const mockInsertDice = vi.fn().mockResolvedValue({ error: null })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsertMsg, select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        if (table === 'dice_rolls') return { insert: mockInsertDice }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Edge Error'))

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendDiceRoll('1d20')
    })

    expect(console.error).toHaveBeenCalledWith('Failed to trigger push for message', expect.any(Error))
  })

  it('catches push-notification edge function error on updating active_player_ids', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockEqReset = vi.fn().mockResolvedValue({ error: null })
    const mockInSet = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'm1' }], error: null }) })
    const mockEqSet = vi.fn().mockReturnValue({ in: mockInSet })
    const mockUpdate = vi.fn().mockImplementation((payload) => {
      if (payload.is_active_player === false) {
        return { eq: mockEqReset }
      }
      return { eq: mockEqSet }
    })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        if (table === 'channel_members') return { update: mockUpdate }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    vi.mocked(supabase.functions.invoke).mockImplementation((_name: string, args: any) => {
      if (args?.body?.table === 'channel_members') {
        return Promise.reject(new Error('Edge Error Turn Change'))
      }
      return Promise.resolve({ error: null } as any)
    })

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'Hello', type: 'regular', active_player_ids: ['u2'] })
    })

    expect(console.error).toHaveBeenCalledWith('Failed to trigger push for turn', expect.any(Error))
  })

  it('updates active_player_ids when sending a message', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockEqReset = vi.fn().mockResolvedValue({ error: null })
    const mockInSet = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'm1' }], error: null }) })
    const mockEqSet = vi.fn().mockReturnValue({ in: mockInSet })
    const mockUpdate = vi.fn().mockImplementation((payload) => {
      if (payload.is_active_player === false) {
        return { eq: mockEqReset }
      }
      return { eq: mockEqSet }
    })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        if (table === 'channel_members') return { update: mockUpdate }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'test', type: 'regular', active_player_ids: ['u2'] })
    })

    expect(mockUpdate).toHaveBeenCalledWith({ is_active_player: false })
    expect(mockUpdate).toHaveBeenCalledWith({ is_active_player: true })
  })

  it('sends a dice roll message and creates a dice_roll log', async () => {
    const mockSingleMessage = vi.fn().mockResolvedValue({ data: { id: 'msg1' }, error: null })
    const mockSelectMessage = vi.fn().mockReturnValue({ single: mockSingleMessage })
    const mockInsertDice = vi.fn().mockResolvedValue({ error: null })

    const mockInsert = vi.fn().mockImplementation((payload) => {
      if (payload.type === 'dice_roll') {
        return { select: mockSelectMessage }
      }
      return Promise.resolve({ error: null })
    })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        if (table === 'dice_rolls') return { insert: mockInsertDice }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendDiceRoll('1d20+5')
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'c1',
      sender_id: 'u1',
      content: 'Rolled 1d20+5: **16**',
      type: 'dice_roll'
    }))

    expect(mockInsertDice).toHaveBeenCalledWith(expect.objectContaining({
      message_id: 'msg1',
      channel_id: 'c1',
      roller_id: 'u1',
      notation: '1d20+5',
      result: 16,
      breakdown: {
        rolls: [11],
        dropped: [],
        modifier: 5
      }
    }))

    vi.restoreAllMocks()
  })
})
