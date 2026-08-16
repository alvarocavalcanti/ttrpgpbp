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

// Builds a mock `from()` chain. For 'messages' it uses fetchBuilder, for
// 'message_reactions' it returns an empty list (override with reactionsBuilder).
function mockFrom({
  fetchBuilder = () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
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

// Message insert returns the new row's id (`.select('id').single()`). Push is
// fired by a DB trigger server-side, so the id is not consumed by the hook.
function mockInsertMessage(id = 'msg1') {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id }, error: null }) })
  })
}

// Captures the realtime callbacks keyed by table name (messages and
// message_reactions now share one channel).
function mockChannels() {
  const callbacks: Record<string, any> = {}
  vi.mocked(supabase.channel).mockImplementation(() => {
    const on = vi.fn().mockImplementation((_event: any, filter: any, callback: any) => {
      callbacks[filter.table] = callback
      return { on, subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }
    })
    return { on } as any
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
    const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 'm1', sender: [{ display_name: 'Hero' }] }], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.messages[0].sender?.display_name).toBe('Hero')
    })

    expect(callbacks['messages']).toBeDefined()
    expect(callbacks['message_reactions']).toBeDefined()
  })

  it('handles fetch error gracefully', async () => {
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }) }) }) })
    })
    mockChannels()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(console.error).toHaveBeenCalled()
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  it('fetches messages using the reply_message computed relationship', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 'm1', reply: { id: 'm0' } }], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
      return { select: mockSelect } as any
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    const selectArg = mockSelect.mock.calls[0][0] as string
    expect(selectArg).toContain('reply:reply_message(')
    expect(selectArg).not.toContain('messages_reply_to_fkey')
    expect(selectArg).not.toContain('reply:messages(')
    expect(result.current.messages[0].reply).toEqual({ id: 'm0' })
  })

  it('handles realtime INSERT with joins', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockSingleJoin = vi.fn().mockResolvedValue({ data: { id: 'm3', sender: { display_name: 'JoinedUser' } } })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: mockOrder, single: mockSingleJoin }) })
    })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages']({ eventType: 'INSERT', new: { id: 'm3', sender_id: 'u2' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].sender?.display_name).toBe('JoinedUser')
  })

  it('handles realtime INSERT with joins when data is null', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockSingleJoin = vi.fn().mockResolvedValue({ data: null })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: mockOrder, single: mockSingleJoin }) })
    })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages']({ eventType: 'INSERT', new: { id: 'm3', sender_id: 'u2' } })
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('handles realtime INSERT without joins', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages']({ eventType: 'INSERT', new: { id: 'm2', content: 'system msg' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('m2')
  })

  it('handles realtime UPDATE and DELETE', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 'm1', content: 'hello' }], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages']({ eventType: 'UPDATE', new: { id: 'm1', content: 'edited' } })
    })

    expect(result.current.messages[0].content).toBe('edited')

    await act(async () => {
      await callbacks['messages']({ eventType: 'DELETE', old: { id: 'm1' } })
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('allows sending, editing, deleting', async () => {
    const mockInsert = mockInsertMessage()
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })

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
    const mockInsert = mockInsertMessage()
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
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
  })

  it('upserts the NPC roster and inserts an NPC message with snapshot columns', async () => {
    const mockInsert = mockInsertMessage()
    const mockNpcUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'channel_npcs') return { upsert: mockNpcUpsert }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'Trespassers!', type: 'npc', npc_name: 'Goblin King', npc_avatar_url: 'https://example.com/king.png' })
    })

    expect(mockNpcUpsert).toHaveBeenCalledWith(
      { channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://example.com/king.png' },
      { onConflict: 'channel_id,name', ignoreDuplicates: true }
    )
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'c1',
      sender_id: 'u1',
      content: 'Trespassers!',
      type: 'npc',
      npc_name: 'Goblin King',
      npc_avatar_url: 'https://example.com/king.png'
    }))
  })

  it('handles reactions fetch error without failing the view', async () => {    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
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
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
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
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) })
    })
    const callbacks = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['message_reactions']({ eventType: 'INSERT', new: { id: 'r1', message_id: 'm1', channel_id: 'c1', user_id: 'u2', emoji: '👍' } })
    })
    expect(result.current.reactions['m1']).toEqual([{ emoji: '👍', count: 1, hasReacted: false }])

    await act(async () => {
      await callbacks['message_reactions']({ eventType: 'DELETE', old: { id: 'r1', message_id: 'm1', channel_id: 'c1', user_id: 'u2', emoji: '👍' } })
    })
    expect(result.current.reactions['m1']).toBeUndefined()
  })

  it('adds and removes reactions', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockMatchDelete = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ match: mockMatchDelete })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'message_reactions') return { insert: mockInsert, delete: mockDelete, select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
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

  it('updates active_player_ids when sending a message', async () => {
    const mockInsert = mockInsertMessage()
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
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
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
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
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
      await result.current.sendDiceRoll('1d20+5', 'parent1')
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'c1',
      sender_id: 'u1',
      content: 'Rolled 1d20+5: **16**',
      type: 'dice_roll',
      reply_to: 'parent1'
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

  it('stores the DC and success flag when a check rolls at or above the DC', async () => {
    const mockSingleMessage = vi.fn().mockResolvedValue({ data: { id: 'msg2' }, error: null })
    const mockSelectMessage = vi.fn().mockReturnValue({ single: mockSingleMessage })
    const mockInsertDice = vi.fn().mockResolvedValue({ error: null })

    const mockInsert = vi.fn().mockImplementation((payload) => {
      if (payload.type === 'dice_roll') {
        return { select: mockSelectMessage }
      }
      return Promise.resolve({ error: null })
    })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
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
      await result.current.sendDiceRoll('1d20+2', 'parent1', undefined, 12)
    })

    // Math.random 0.5 -> d20 roll of 11, +2 = 13, meets DC 12
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'c1',
      sender_id: 'u1',
      content: 'Rolled 1d20+2: **13**\n\n**Success** (DC 12)',
      type: 'dice_roll',
      reply_to: 'parent1',
      roll_dc: 12,
      roll_success: true
    }))

    expect(mockInsertDice).toHaveBeenCalledWith(expect.objectContaining({
      message_id: 'msg2',
      channel_id: 'c1',
      roller_id: 'u1',
      notation: '1d20+2',
      result: 13,
      breakdown: {
        rolls: [11],
        dropped: [],
        modifier: 2
      }
    }))

    vi.restoreAllMocks()
  })

  it('marks a check as failure when the total is below the DC', async () => {
    const mockSingleMessage = vi.fn().mockResolvedValue({ data: { id: 'msg3' }, error: null })
    const mockSelectMessage = vi.fn().mockReturnValue({ single: mockSingleMessage })
    const mockInsertDice = vi.fn().mockResolvedValue({ error: null })

    const mockInsert = vi.fn().mockImplementation((payload) => {
      if (payload.type === 'dice_roll') {
        return { select: mockSelectMessage }
      }
      return Promise.resolve({ error: null })
    })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
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
      await result.current.sendDiceRoll('1d20-2', undefined, undefined, 15)
    })

    // Math.random 0.5 -> d20 roll of 11, -2 = 9, below DC 15
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'c1',
      sender_id: 'u1',
      content: 'Rolled 1d20-2: **9**\n\n**Failure** (DC 15)',
      type: 'dice_roll',
      reply_to: null,
      roll_dc: 15,
      roll_success: false
    }))

    vi.restoreAllMocks()
  })

  it('formats advantage/disadvantage rolls with the roll details', async () => {
    const mockSingleMessage = vi.fn().mockResolvedValue({ data: { id: 'msg4' }, error: null })
    const mockSelectMessage = vi.fn().mockReturnValue({ single: mockSingleMessage })
    const mockInsertDice = vi.fn().mockResolvedValue({ error: null })

    const mockInsert = vi.fn().mockImplementation((payload) => {
      if (payload.type === 'dice_roll') {
        return { select: mockSelectMessage }
      }
      return Promise.resolve({ error: null })
    })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { insert: mockInsert, select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'dice_rolls') return { insert: mockInsertDice }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    mockChannels()

    // 2d20kl1 with Math.random sequence -> rolls [3, 19], keeps lowest 3
    let calls = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const seq = [0.1, 0.9]
      const v = seq[calls % seq.length]
      calls++
      return v
    })

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendDiceRoll('2d20kl1', 'parent1')
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'c1',
      sender_id: 'u1',
      content: 'Rolled 2d20 with DIS [3, 19]: **3**',
      type: 'dice_roll',
      reply_to: 'parent1'
    }))

    expect(mockInsertDice).toHaveBeenCalledWith(expect.objectContaining({
      notation: '2d20kl1',
      result: 3,
      breakdown: {
        rolls: [3, 19],
        dropped: [19],
        modifier: 0
      }
    }))

    vi.restoreAllMocks()
  })

  it('exposes hasMore when the initial page is full', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, content: `msg ${i}`, created_at: `2023-01-01T00:00:0${i % 10}Z` }))
    const mockLimit = vi.fn().mockResolvedValue({ data: full, error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.messages).toHaveLength(50)
    expect(result.current.hasMore).toBe(true)
  })

  it('does not expose hasMore when the initial page is partial', async () => {
    const partial = [{ id: 'm1', content: 'only one' }]
    const mockLimit = vi.fn().mockResolvedValue({ data: partial, error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.hasMore).toBe(false)
  })

  it('loads older messages and prepends them without duplicating', async () => {
    const initial = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, content: `msg ${i}`, created_at: `2023-01-01T00:00:0${i % 10}Z` }))
    const older = [{ id: 'm-old', content: 'older', created_at: '2022-12-31T00:00:00Z' }]
    const mockLimit = vi.fn()
      .mockResolvedValueOnce({ data: initial, error: null })
      .mockResolvedValueOnce({ data: older, error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    // eq() must satisfy both the initial fetch (order) and loadOlder (lt).
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder, lt: vi.fn().mockReturnValue({ order: mockOrder }) })
    mockFrom({ fetchBuilder: () => ({ eq: mockEq }) })
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.hasMore).toBe(true)

    await act(async () => {
      await result.current.loadOlder()
    })

    expect(result.current.messages).toHaveLength(51)
    expect(result.current.messages[0].id).toBe('m-old')
    expect(result.current.hasMore).toBe(false)
  })
})
