import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelNpcs } from './useChannelNpcs'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('useChannelNpcs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockNpcRow = { id: 'n1', channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://x/a.png', created_at: '' }

  // A builder that exposes the methods the hook chains, so a single
  // `supabase.from` mock can serve both the mutation and the refetch inside
  // one call.
  function mockBuilder(overrides: Record<string, any> = {}) {
    const select = overrides.select ?? vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) })
    const builder = {
      select,
      upsert: overrides.upsert ?? vi.fn().mockResolvedValue({ data: null, error: null }),
      update: overrides.update ?? vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      delete: overrides.delete ?? vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as any)
    return builder
  }

  function mockQuery(data: any[] = [], error: any = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) })
    mockBuilder({ select })
    return mockOrder
  }

  function mockUpsert(data: any = null, error: any = null) {
    const mockUpsert = vi.fn().mockResolvedValue({ data, error })
    mockBuilder({ upsert: mockUpsert })
    return mockUpsert
  }

  function mockUpdate(data: any = null, error: any = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    mockBuilder({ update: mockUpdate })
    return mockUpdate
  }

  function mockDelete(data: any = null, error: any = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
    mockBuilder({ delete: mockDelete })
    return mockDelete
  }

  it('fetches channel NPCs', async () => {
    mockQuery([mockNpcRow])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.npcs).toEqual([mockNpcRow])
  })

  it('surfaces a fetch error', async () => {
    mockQuery([], { message: 'boom' })
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toBe('boom')
    expect(result.current.npcs).toEqual([])
  })

  it('returns no NPCs for a missing channelId', () => {
    const { result } = renderHook(() => useChannelNpcs(undefined))
    expect(result.current.loading).toBe(false)
    expect(result.current.npcs).toEqual([])
  })

  it('adds a new NPC and dedupes by name', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.addNpc(mockNpcRow)
      result.current.addNpc({ ...mockNpcRow, name: 'goblin king' })
      result.current.addNpc({ id: 'n2', channel_id: 'c1', name: 'Dragon', avatar_url: 'https://x/b.png', created_at: '' })
    })

    expect(result.current.npcs.map(n => n.name)).toEqual(['Dragon', 'Goblin King'])
  })

  it('creates an NPC with an upsert that ignores duplicates', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const upsert = mockUpsert()
    const selectOrder = vi.fn().mockResolvedValue({ data: [mockNpcRow], error: null })
    mockBuilder({
      upsert,
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: selectOrder }) }),
    })

    let ok = false
    await act(async () => { ok = await result.current.createNpc('Goblin King', 'https://x/a.png') })
    expect(ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      { channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://x/a.png' },
      { onConflict: 'channel_id,name', ignoreDuplicates: true }
    )
    await waitFor(() => expect(result.current.npcs).toEqual([mockNpcRow]))
  })

  it('createNpc returns false on error', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockUpsert(null, new Error('boom'))
    let ok = true
    await act(async () => { ok = await result.current.createNpc('Goblin King', 'https://x/a.png') })
    expect(ok).toBe(false)
  })

  it('renames an NPC and refetches', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const selectOrder = vi.fn().mockResolvedValue({ data: [{ ...mockNpcRow, name: 'Goblin Prince' }], error: null })
    const update = mockUpdate()
    mockBuilder({
      update,
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: selectOrder }) }),
    })

    let ok = false
    await act(async () => { ok = await result.current.renameNpc('n1', 'Goblin Prince') })
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ name: 'Goblin Prince' })
    await waitFor(() => expect(result.current.npcs[0].name).toBe('Goblin Prince'))
  })

  it('renameNpc returns false on error', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockUpdate(null, new Error('boom'))
    let ok = true
    await act(async () => { ok = await result.current.renameNpc('n1', 'Goblin Prince') })
    expect(ok).toBe(false)
  })

  it('repictures an NPC and refetches', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const selectOrder = vi.fn().mockResolvedValue({ data: [{ ...mockNpcRow, avatar_url: 'https://x/new.png' }], error: null })
    const update = mockUpdate()
    mockBuilder({
      update,
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: selectOrder }) }),
    })

    let ok = false
    await act(async () => { ok = await result.current.repictureNpc('n1', 'https://x/new.png') })
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ avatar_url: 'https://x/new.png' })
    await waitFor(() => expect(result.current.npcs[0].avatar_url).toBe('https://x/new.png'))
  })

  it('deletes an NPC and refetches', async () => {
    mockQuery([mockNpcRow])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const selectOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const deleteFn = mockDelete()
    mockBuilder({
      delete: deleteFn,
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: selectOrder }) }),
    })

    let ok = false
    await act(async () => { ok = await result.current.deleteNpc('n1') })
    expect(ok).toBe(true)
    expect(deleteFn).toHaveBeenCalled()
    await waitFor(() => expect(result.current.npcs).toEqual([]))
  })

  it('deleteNpc returns false on error', async () => {
    mockQuery([])
    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockDelete(null, new Error('boom'))
    let ok = true
    await act(async () => { ok = await result.current.deleteNpc('n1') })
    expect(ok).toBe(false)
  })
})
