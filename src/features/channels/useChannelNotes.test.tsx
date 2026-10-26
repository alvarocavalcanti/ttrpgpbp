import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelNotes } from './useChannelNotes'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}))

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  channel_id: 'c1',
  author_id: 'u1',
  scope: 'party',
  body: 'hello',
  created_at: '2026-10-26T10:00:00Z',
  updated_at: '2026-10-26T10:00:00Z',
  ...over,
})

const realtime = () => {
  const handlers: Array<(payload: unknown) => void> = []
  const channel = {
    on: vi.fn().mockImplementation((_event, _filter, cb) => {
      handlers.push(cb)
      return channel
    }),
    subscribe: vi.fn().mockImplementation((cb) => {
      cb('SUBSCRIBED')
      return channel
    }),
    unsubscribe: vi.fn(),
  }
  return { channel, handlers }
}

function mockSupabase({
  rows = [] as unknown[],
  fetchError = null as unknown,
  insertError = null as unknown,
  updateError = null as unknown,
  deleteError = null as unknown,
} = {}) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: fetchError })
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const updateEq = vi.fn().mockResolvedValue({ error: updateError })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError })
  const del = vi.fn().mockReturnValue({ eq: deleteEq })
  vi.mocked(supabase.from).mockReturnValue({ select, insert, update, delete: del } as never)
  const rt = realtime()
  vi.mocked(supabase.channel).mockReturnValue(rt.channel as never)
  return { rt, insert, update, updateEq, del, deleteEq, select, eq, order }
}

describe('useChannelNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads and parses the channel notes newest first', async () => {
    const mock = mockSupabase({ rows: [note(), note({ id: 'n2', scope: 'character' })] })
    const { result } = renderHook(() => useChannelNotes('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notes.map(n => n.id)).toEqual(['n1', 'n2'])
    expect(mock.eq).toHaveBeenCalledWith('channel_id', 'c1')
    expect(mock.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('drops a malformed row instead of rendering it', async () => {
    mockSupabase({ rows: [note(), { ...note({ id: 'bad' }), scope: 'unknown' }] })
    const { result } = renderHook(() => useChannelNotes('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notes.map(n => n.id)).toEqual(['n1'])
  })

  it('returns early without a channel id', () => {
    mockSupabase()
    const { result } = renderHook(() => useChannelNotes(undefined))
    expect(result.current.loading).toBe(false)
    expect(result.current.notes).toEqual([])
  })

  it('surfaces a fetch error and can retry', async () => {
    const mock = mockSupabase({ fetchError: new Error('db down') })
    const { result } = renderHook(() => useChannelNotes('c1'))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error?.message).toBe('db down')

    act(() => result.current.refetch())
    await waitFor(() => expect(mock.select).toHaveBeenCalledTimes(2))
  })

  it('applies realtime insert, update and delete without duplicating', async () => {
    const mock = mockSupabase({ rows: [note()] })
    const { result } = renderHook(() => useChannelNotes('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => mock.rt.handlers[0]({
      eventType: 'INSERT',
      new: note({ id: 'n2', body: 'second' }),
    }))
    expect(result.current.notes.map(n => n.id)).toEqual(['n2', 'n1'])

    // The same insert arriving twice must not duplicate the row.
    act(() => mock.rt.handlers[0]({
      eventType: 'INSERT',
      new: note({ id: 'n2', body: 'second' }),
    }))
    expect(result.current.notes).toHaveLength(2)

    act(() => mock.rt.handlers[0]({
      eventType: 'UPDATE',
      new: note({ body: 'edited' }),
    }))
    expect(result.current.notes.find(n => n.id === 'n1')?.body).toBe('edited')

    act(() => mock.rt.handlers[0]({ eventType: 'DELETE', old: { id: 'n1' } }))
    expect(result.current.notes.map(n => n.id)).toEqual(['n2'])
  })

  it('trims a new note and sends the author and scope', async () => {
    const mock = mockSupabase()
    const { result } = renderHook(() => useChannelNotes('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = false
    await act(async () => { ok = await result.current.createNote('party', '  shared clue  ') })
    expect(ok).toBe(true)
    expect(mock.insert).toHaveBeenCalledWith({
      channel_id: 'c1',
      author_id: 'u1',
      scope: 'party',
      body: 'shared clue',
    })
  })

  it('rejects blank and over-limit bodies without writing', async () => {
    const mock = mockSupabase()
    const { result } = renderHook(() => useChannelNotes('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      expect(await result.current.createNote('party', '   ')).toBe(false)
      expect(await result.current.createNote('party', 'x'.repeat(4001))).toBe(false)
    })
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it('updates and deletes a note', async () => {
    const mock = mockSupabase()
    const { result } = renderHook(() => useChannelNotes('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      expect(await result.current.updateNote('n1', ' edited ')).toBe(true)
      expect(await result.current.deleteNote('n1')).toBe(true)
    })
    expect(mock.update).toHaveBeenCalledWith({ body: 'edited' })
    expect(mock.updateEq).toHaveBeenCalledWith('id', 'n1')
    expect(mock.deleteEq).toHaveBeenCalledWith('id', 'n1')
  })

  it('returns false and keeps state usable when a write fails', async () => {
    mockSupabase({ insertError: new Error('nope') })
    const { result } = renderHook(() => useChannelNotes('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      expect(await result.current.createNote('party', 'hello')).toBe(false)
    })
    expect(result.current.notes).toEqual([])
  })

  it('resets and refetches when the channel changes', async () => {
    const mock = mockSupabase({ rows: [note()] })
    const { result, rerender } = renderHook(({ id }) => useChannelNotes(id), {
      initialProps: { id: 'c1' },
    })
    await waitFor(() => expect(result.current.notes).toHaveLength(1))

    rerender({ id: 'c2' })
    await waitFor(() => expect(mock.eq).toHaveBeenLastCalledWith('channel_id', 'c2'))
    await waitFor(() => expect(result.current.notes).toHaveLength(1))
  })
})
