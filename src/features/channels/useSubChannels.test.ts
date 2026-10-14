import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSubChannels } from './useSubChannels'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    removeChannel: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
  },
}))

const room = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  channel_id: 'c1',
  name: 'OOC',
  is_archived: false,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...over,
})

// The list query chain is select('*').eq('channel_id', …).order('created_at', …).
const mockList = (data: unknown[] | null, error: unknown = null) => {
  const order = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, order }
}

describe('useSubChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns early with no user or no channel id', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
    const { result } = renderHook(() => useSubChannels('c1'))
    expect(result.current.loading).toBe(false)
    expect(result.current.subChannels).toEqual([])
  })

  it('fetches rooms and splits active from archived', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    const list = mockList([room({ id: 'r1', name: 'OOC' }), room({ id: 'r2', name: 'Old', is_archived: true })])
    vi.mocked(supabase.from).mockReturnValue({ select: list.select } as never)

    const { result } = renderHook(() => useSubChannels('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.subChannels.map(r => r.id)).toEqual(['r1'])
    expect(result.current.archivedRooms.map(r => r.id)).toEqual(['r2'])
    expect(list.eq).toHaveBeenCalledWith('channel_id', 'c1')
  })

  it('drops a malformed row but keeps the rest usable', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    const list = mockList([{ name: 'no id' }, room({ id: 'r2' })])
    vi.mocked(supabase.from).mockReturnValue({ select: list.select } as never)

    const { result } = renderHook(() => useSubChannels('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.subChannels.map(r => r.id)).toEqual(['r2'])
  })

  it('surfaces a list error without blanking the hook', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    const list = mockList(null, new Error('boom'))
    vi.mocked(supabase.from).mockReturnValue({ select: list.select } as never)

    const { result } = renderHook(() => useSubChannels('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.subChannels).toEqual([])
  })

  it('adds, updates and removes rooms from the realtime echo', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    const list = mockList([room({ id: 'r1' })])
    vi.mocked(supabase.from).mockReturnValue({ select: list.select } as never)

    let handler: ((payload: unknown) => void) | undefined
    const mockOn = vi.fn().mockImplementation((_event, _config, cb) => {
      if (_config.table === 'sub_channels') handler = cb
      return { on: mockOn, subscribe: vi.fn().mockImplementation(cb2 => { cb2?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }) }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as never)

    const { result } = renderHook(() => useSubChannels('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { handler?.({ eventType: 'INSERT', new: room({ id: 'r2', name: 'Dice' }) }) })
    expect(result.current.subChannels.map(r => r.id)).toEqual(['r1', 'r2'])

    await act(async () => { handler?.({ eventType: 'UPDATE', new: room({ id: 'r2', is_archived: true }) }) })
    expect(result.current.subChannels.map(r => r.id)).toEqual(['r1'])
    expect(result.current.archivedRooms.map(r => r.id)).toEqual(['r2'])

    await act(async () => { handler?.({ eventType: 'DELETE', old: { id: 'r1' } }) })
    expect(result.current.subChannels).toEqual([])
  })

  it('create calls create_sub_channel and returns the new id', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    vi.mocked(supabase.from).mockReturnValue({ select: mockList([]).select } as never)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'new-id', error: null } as never)

    const { result } = renderHook(() => useSubChannels('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const id = await result.current.create('OOC')
    expect(id).toBe('new-id')
    expect(supabase.rpc).toHaveBeenCalledWith('create_sub_channel', { p_channel_id: 'c1', p_name: 'OOC' })
  })

  it('rename / setArchived / remove call the room RPCs and rethrow errors', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    vi.mocked(supabase.from).mockReturnValue({ select: mockList([]).select } as never)

    const { result } = renderHook(() => useSubChannels('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.rename('r1', 'Renamed')
    expect(supabase.rpc).toHaveBeenCalledWith('update_sub_channel', { p_sub_channel_id: 'r1', p_name: 'Renamed' })

    await result.current.setArchived('r1', true)
    expect(supabase.rpc).toHaveBeenCalledWith('update_sub_channel', { p_sub_channel_id: 'r1', p_is_archived: true })

    await result.current.remove('r1')
    expect(supabase.rpc).toHaveBeenCalledWith('delete_sub_channel', { p_sub_channel_id: 'r1' })

    vi.mocked(supabase.rpc).mockResolvedValue({ error: new Error('nope') } as never)
    await expect(result.current.remove('r1')).rejects.toThrow('nope')
  })

  it('create rejects without a channel id (defensive)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    const { result } = renderHook(() => useSubChannels(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.create('x')).rejects.toThrow('No channel.')
  })
})
