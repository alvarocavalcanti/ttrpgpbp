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
    rpc: vi.fn()
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

// Captures the realtime callbacks keyed by table name (messages and
// message_reactions now share one channel).
function mockChannels() {
  const callbacks: Record<string, any> = {}
  let statusCb: ((status: string) => void) | undefined
  vi.mocked(supabase.channel).mockImplementation(() => {
    const on = vi.fn().mockImplementation((_event: any, filter: any, callback: any) => {
      callbacks[filter.table] = callback
      return { on, subscribe: vi.fn().mockImplementation(cb => { statusCb = cb; cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }) }
    })
    return { on } as any
  })
  return { callbacks, emitStatus: (status: string) => statusCb?.(status) }
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
    const { callbacks } = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.messages[0].sender?.display_name).toBe('Hero')
    })

    expect(callbacks['messages']).toBeDefined()
    expect(callbacks['message_reactions']).toBeDefined()
  })

  it('reconciles by refetching after a realtime reconnect', async () => {
    const mockLimit = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 'm1' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'm1' }, { id: 'm2' }], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const { emitStatus } = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(1)
    })

    // Simulate the socket dropping and re-establishing: the missed 'm2' insert
    // is recovered by the refetch triggered on the second SUBSCRIBED.
    await act(async () => {
      emitStatus('SUBSCRIBED')
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })
    expect(result.current.messages[0].id).toBe('m2')
    expect(mockLimit).toHaveBeenCalledTimes(2)
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
    const { callbacks } = mockChannels()

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
    const { callbacks } = mockChannels()

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
    const { callbacks } = mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await callbacks['messages']({ eventType: 'INSERT', new: { id: 'm2', content: 'system msg' } })
      await callbacks['messages']({ eventType: 'INSERT', new: { id: 'm2', content: 'system msg' } })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('m2')
  })

  it('handles realtime UPDATE and DELETE', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 'm1', content: 'hello' }], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockFrom({ fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }) })
    const { callbacks } = mockChannels()

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
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })

    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: mockOrder }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { update: mockUpdate, select: () => ({ eq: () => ({ order: mockOrder }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'test', type: 'regular' })
    })
    expect(mockRpc).toHaveBeenCalledWith('send_message', expect.objectContaining({ p_content: 'test', p_type: 'regular' }))

    await act(async () => {
      await result.current.editMessage('m1', 'new test')
    })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ content: 'new test' }))

    await act(async () => {
      await result.current.deleteMessage('m1')
    })
    expect(mockUpdate).toHaveBeenCalledWith({ is_deleted: true })
  })

  it('rejects oversized message edits before sending them', async () => {
    const { result } = renderHook(() => useMessages('c1'))

    await expect(result.current.editMessage('m1', 'x'.repeat(4001))).rejects.toThrow('max 4000')
  })

  it('sends reply_to when replying', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'reply', type: 'regular', reply_to: 'm1' })
    })

    expect(mockRpc).toHaveBeenCalledWith('send_message', expect.objectContaining({ p_reply_to: 'm1' }))
  })

  it('sends NPC messages through the send_message command', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'Trespassers!', type: 'npc', npc_name: 'Goblin King', npc_avatar_url: 'https://example.com/king.png' })
    })

    expect(mockRpc).toHaveBeenCalledWith('send_message', expect.objectContaining({
      p_channel_id: 'c1',
      p_content: 'Trespassers!',
      p_type: 'npc',
      p_npc_name: 'Goblin King',
      p_npc_avatar_url: 'https://example.com/king.png'
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
    const { callbacks } = mockChannels()

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
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage({ content: 'test', type: 'regular', active_player_ids: ['u2'] })
    })

    expect(mockRpc).toHaveBeenCalledWith('send_message', expect.objectContaining({ p_active_player_ids: ['u2'] }))
  })

  it('sends a dice roll through the roll_dice command', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendDiceRoll('1d20+5', 'parent1')
    })

    expect(mockRpc).toHaveBeenCalledWith('roll_dice', expect.objectContaining({
      p_channel_id: 'c1',
      p_notation: '1d20+5',
      p_reply_to: 'parent1'
    }))
  })

  it('rejects oversized roll warnings before sending them', async () => {
    const { result } = renderHook(() => useMessages('c1'))

    await expect(result.current.sendDiceRoll('1d20', undefined, 'x'.repeat(501))).rejects.toThrow('max 500')
    expect(supabase.rpc).not.toHaveBeenCalledWith('roll_dice', expect.anything())
  })

  it('passes the DC and reply target for check rolls', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendDiceRoll('1d20+2', 'parent1', 'Missing modifier warning', 12)
    })

    expect(mockRpc).toHaveBeenCalledWith('roll_dice', expect.objectContaining({
      p_notation: '1d20+2',
      p_reply_to: 'parent1',
      p_warning: 'Missing modifier warning',
      p_dc: 12
    }))
  })

  it('rolls without a reply target or DC when omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendDiceRoll('2d20kl1')
    })

    expect(mockRpc).toHaveBeenCalledWith('roll_dice', expect.objectContaining({
      p_notation: '2d20kl1',
      p_reply_to: null,
      p_warning: null,
      p_dc: null
    }))
  })

  it('surfaces roll_dice errors', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('Too many dice') })
    mockFrom({
      fetchBuilder: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      tableHandler: (table) => {
        if (table === 'messages') return { select: () => ({ eq: () => ({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
        if (table === 'message_reactions') return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        return {}
      }
    })
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
    mockChannels()

    const { result } = renderHook(() => useMessages('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.sendDiceRoll('101d20')).rejects.toThrow('Too many dice')
    expect(mockRpc).toHaveBeenCalledWith('roll_dice', expect.objectContaining({ p_notation: '101d20' }))
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
