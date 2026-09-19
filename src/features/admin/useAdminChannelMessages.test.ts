import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAdminChannelMessages } from './useAdminChannelMessages'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

function makeRow(id: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    channel_id: 'c1',
    sender_id: 'u1',
    sender_display_name: 'Alice',
    sender_character_name: 'Alicia the Bold',
    content: `message ${id}`,
    type: 'regular',
    is_deleted: false,
    whisper_to: null,
    npc_name: null,
    created_at: createdAt,
    ...overrides,
  }
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Strahd',
    game_system: 'D&D 5e',
    gm_id: 'u1',
    member_count: 2,
    created_at: '2026-09-18T10:00:00Z',
    last_message_at: null,
    gm_display_name: 'Alice',
    ...overrides,
  }
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'u1',
    display_name: 'Alice',
    character_name: 'Alicia the Bold',
    is_blocked: false,
    is_active_player: false,
    ...overrides,
  }
}

// Messages RPC serves `pages` in order; the channel and members RPCs resolve
// their own payloads. Members calls must branch before the messages pages,
// otherwise a members fetch would consume a message page (or vice versa).
function pagedMessagesRpc(pages: unknown[], channels: unknown = [], members: unknown = []) {
  let page = 0
  vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
    if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
    if (fn === 'admin_list_channel_members') return Promise.resolve({ data: members, error: null })
    const data = pages[Math.min(page++, pages.length - 1)]
    return Promise.resolve(data instanceof Error
      ? { data: null, error: data }
      : { data, error: null })
  }) as any)
}

describe('useAdminChannelMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the newest page and displays oldest-first', async () => {
    const rows = [
      makeRow('m2', '2026-09-18T12:01:00Z'),
      makeRow('m1', '2026-09-18T12:00:00Z'),
    ]
    vi.mocked(supabase.rpc).mockResolvedValue({ data: rows, error: null } as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_channel_messages', {
      p_channel_id: 'c1',
      p_limit: 50,
    })
    expect(result.current.messages.map(m => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.hasMore).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets hasMore when a full page arrives', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      makeRow(`m${i}`, `2026-09-18T12:${String(59 - i).padStart(2, '0')}:00Z`))
    vi.mocked(supabase.rpc).mockResolvedValue({ data: rows, error: null } as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.hasMore).toBe(true)
    expect(result.current.messages).toHaveLength(50)
  })

  it('loadOlder pages with the oldest cursor and prepends', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) =>
      makeRow(`new${i}`, `2026-09-18T12:${String(59 - i).padStart(2, '0')}:00Z`))
    const olderPage = [
      makeRow('old2', '2026-09-18T11:01:00Z'),
      makeRow('old1', '2026-09-18T11:00:00Z'),
    ]
    let pageCalls = 0
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
      if (pageCalls++ === 0) return Promise.resolve({ data: firstPage, error: null })
      return Promise.resolve({ data: olderPage, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)

    const oldest = firstPage[firstPage.length - 1]
    await act(async () => { await result.current.loadOlder() })

    expect(supabase.rpc).toHaveBeenLastCalledWith('admin_list_channel_messages', {
      p_channel_id: 'c1',
      p_before: oldest.created_at,
      p_before_id: oldest.id,
      p_limit: 50,
    })
    expect(result.current.messages.map(m => m.id).slice(0, 2)).toEqual(['old1', 'old2'])
    expect(result.current.messages).toHaveLength(52)
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps loaded messages when an older page fails', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) =>
      makeRow(`new${i}`, `2026-09-18T12:${String(59 - i).padStart(2, '0')}:00Z`))
    pagedMessagesRpc([firstPage, new Error('DB down')])

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.loadOlder() })

    expect(result.current.messages).toHaveLength(50)
    expect(result.current.error).not.toBeNull()
    expect(result.current.loadingOlder).toBe(false)
  })

  it('does not page when hasMore is false', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [makeRow('m1', '2026-09-18T12:00:00Z')], error: null } as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.loadOlder() })
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
  })

  it('surfaces a load error when the RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('DB down') } as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('surfaces a load error when the RPC promise rejects', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('surfaces a load error on a non-array payload', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { messages: [] }, error: null } as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('drops malformed rows while valid rows survive', async () => {
    const rows = [
      makeRow('good', '2026-09-18T12:00:00Z'),
      { ...makeRow('bad-type', '2026-09-18T12:01:00Z'), is_deleted: 'no' },
      { id: 'bad-shape', content: 'missing fields' },
      null,
    ]
    vi.mocked(supabase.rpc).mockResolvedValue({ data: rows, error: null } as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.messages.map(m => m.id)).toEqual(['good'])
    expect(result.current.error).toBeNull()
  })

  it('issues no RPC for an undefined channel id', async () => {
    const { result } = renderHook(() => useAdminChannelMessages(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('refetch reloads the newest page', async () => {
    const first = [makeRow('m1', '2026-09-18T12:00:00Z')]
    const second = [
      makeRow('m2', '2026-09-18T12:01:00Z'),
      makeRow('m1', '2026-09-18T12:00:00Z'),
    ]
    pagedMessagesRpc([first, second])

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['m1', 'm2']))
  })

  it('loads the channel header from admin_list_channels', async () => {
    const channel = makeChannel()
    pagedMessagesRpc([[makeRow('m1', '2026-09-18T12:00:00Z')]], [channel])

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.channelLoading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_channels')
    expect(result.current.channel).toEqual(channel)
    expect(result.current.channelError).toBe(false)
    expect(result.current.channelMissing).toBe(false)
  })

  it('flags a missing channel when the id is not listed', async () => {
    pagedMessagesRpc([[]], [makeChannel({ id: 'other' })])

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.channelLoading).toBe(false))

    expect(result.current.channel).toBeNull()
    expect(result.current.channelMissing).toBe(true)
  })

  it('flags a channel load error when the channel RPC fails', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: null, error: new Error('DB down') })
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.channelLoading).toBe(false))

    expect(result.current.channelError).toBe(true)
    expect(result.current.channel).toBeNull()
  })

  it('flags a channel load error when the channel RPC promise rejects', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.channelLoading).toBe(false))

    expect(result.current.channelError).toBe(true)
  })

  it('issues no channel RPC for an undefined channel id', async () => {
    const { result } = renderHook(() => useAdminChannelMessages(undefined))
    await waitFor(() => expect(result.current.channelLoading).toBe(false))

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(result.current.channel).toBeNull()
    expect(result.current.channelMissing).toBe(false)
    expect(result.current.channelError).toBe(false)
  })

  it('discards a stale channel response after a channel switch', async () => {
    const channelC1 = makeChannel({ id: 'c1', name: 'One' })
    const channelC2 = makeChannel({ id: 'c2', name: 'Two' })
    let resolveStale!: (rows: unknown) => void
    const staleGate = new Promise<unknown>(resolve => { resolveStale = resolve })
    let channelCalls = 0
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') {
        channelCalls++
        if (channelCalls === 1) return staleGate.then(data => ({ data, error: null }))
        return Promise.resolve({ data: [channelC2], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result, rerender } = renderHook(({ id }) => useAdminChannelMessages(id), {
      initialProps: { id: 'c1' as string | undefined },
    })
    rerender({ id: 'c2' })
    await waitFor(() => expect(result.current.channel).toEqual(channelC2))

    await act(async () => { resolveStale([channelC1]) })
    await act(async () => {})
    expect(result.current.channel).toEqual(channelC2)
    expect(result.current.channelMissing).toBe(false)
  })

  it('discards a stale older page after a channel switch', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) =>
      makeRow(`new${i}`, `2026-09-18T12:${String(59 - i).padStart(2, '0')}:00Z`))
    const olderPage = [makeRow('old1', '2026-09-18T11:00:00Z')]
    let resolveStale!: (rows: unknown) => void
    const staleGate = new Promise<unknown>(resolve => { resolveStale = resolve })
    let messageCalls = 0
    vi.mocked(supabase.rpc).mockImplementation(((fn: string, args: any) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
      if (fn === 'admin_list_channel_members') return Promise.resolve({ data: [], error: null })
      messageCalls++
      if (messageCalls === 1) return Promise.resolve({ data: firstPage, error: null })
      if (args?.p_channel_id === 'c1') return staleGate.then(data => ({ data, error: null }))
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result, rerender } = renderHook(({ id }) => useAdminChannelMessages(id), {
      initialProps: { id: 'c1' as string | undefined },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)

    let olderPromise!: Promise<void>
    act(() => { olderPromise = result.current.loadOlder() })
    rerender({ id: 'c2' })
    await act(async () => {
      resolveStale(olderPage)
      await olderPromise
    })

    expect(result.current.messages.map(m => m.id)).not.toContain('old1')
    expect(result.current.loadingOlder).toBe(false)
  })

  it('loads the channel roster from admin_list_channel_members', async () => {
    const rows = [
      makeMember({ user_id: 'u1' }),
      makeMember({ user_id: 'u2', display_name: 'Bob', character_name: 'Bobby', is_active_player: true }),
    ]
    pagedMessagesRpc([[makeRow('m1', '2026-09-18T12:00:00Z')]], [], rows)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.membersLoading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_channel_members', { p_channel_id: 'c1' })
    expect(result.current.members).toEqual(rows)
    expect(result.current.membersError).toBe(false)
  })

  it('flags a roster error when the members RPC fails', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
      if (fn === 'admin_list_channel_members') return Promise.resolve({ data: null, error: new Error('DB down') })
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.membersLoading).toBe(false))

    expect(result.current.membersError).toBe(true)
    expect(result.current.members).toEqual([])
  })

  it('flags a roster error when the members RPC promise rejects', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
      if (fn === 'admin_list_channel_members') return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.membersLoading).toBe(false))

    expect(result.current.membersError).toBe(true)
  })

  it('drops malformed roster rows while valid rows survive', async () => {
    const rows = [
      makeMember({ user_id: 'good' }),
      { ...makeMember({ user_id: 'bad-type' }), is_blocked: 'no' },
      { user_id: 'bad-shape' },
      null,
    ]
    pagedMessagesRpc([[]], [], rows)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.membersLoading).toBe(false))

    expect(result.current.members.map(m => m.user_id)).toEqual(['good'])
    expect(result.current.membersError).toBe(false)
  })

  it('issues no members RPC for an undefined channel id', async () => {
    const { result } = renderHook(() => useAdminChannelMessages(undefined))
    await waitFor(() => expect(result.current.membersLoading).toBe(false))

    expect(supabase.rpc).not.toHaveBeenCalledWith('admin_list_channel_members', expect.anything())
    expect(result.current.members).toEqual([])
    expect(result.current.membersError).toBe(false)
  })

  it('refetchMembers reloads the roster', async () => {
    const first = [makeMember({ user_id: 'u1' })]
    const second = [...first, makeMember({ user_id: 'u2', display_name: 'Bob', character_name: 'Bobby' })]
    let calls = 0
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
      if (fn === 'admin_list_channel_members') return Promise.resolve({ data: calls++ === 0 ? first : second, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result } = renderHook(() => useAdminChannelMessages('c1'))
    await waitFor(() => expect(result.current.membersLoading).toBe(false))
    expect(result.current.members).toHaveLength(1)

    await act(async () => { result.current.refetchMembers() })
    await waitFor(() => expect(result.current.members).toHaveLength(2))
  })

  it('discards a stale roster after a channel switch', async () => {
    const rosterC1 = [makeMember({ user_id: 'u1', character_name: 'One' })]
    const rosterC2 = [makeMember({ user_id: 'u2', character_name: 'Two' })]
    let resolveStale!: (rows: unknown) => void
    const staleGate = new Promise<unknown>(resolve => { resolveStale = resolve })
    let membersCalls = 0
    vi.mocked(supabase.rpc).mockImplementation(((fn: string, args: any) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
      if (fn === 'admin_list_channel_members') {
        membersCalls++
        if (membersCalls === 1 && args?.p_channel_id === 'c1') return staleGate.then(data => ({ data, error: null }))
        return Promise.resolve({ data: rosterC2, error: null })
      }
      return Promise.resolve({ data: [], error: null })
    }) as any)

    const { result, rerender } = renderHook(({ id }) => useAdminChannelMessages(id), {
      initialProps: { id: 'c1' as string | undefined },
    })
    rerender({ id: 'c2' })
    await waitFor(() => expect(result.current.members.map(m => m.user_id)).toEqual(['u2']))

    await act(async () => { resolveStale(rosterC1) })
    await act(async () => {})
    expect(result.current.members.map(m => m.user_id)).toEqual(['u2'])
    expect(result.current.membersError).toBe(false)
  })
})
