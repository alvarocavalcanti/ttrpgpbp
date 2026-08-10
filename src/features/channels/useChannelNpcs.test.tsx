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

  it('fetches channel NPCs', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: 'n1', name: 'Goblin King' }], error: null })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) }) } as any)

    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true })
    expect(result.current.npcs).toEqual([{ id: 'n1', name: 'Goblin King' }])
  })

  it('returns no NPCs for a missing channelId', () => {
    const { result } = renderHook(() => useChannelNpcs(undefined))
    expect(result.current.loading).toBe(false)
    expect(result.current.npcs).toEqual([])
  })

  it('adds a new NPC and dedupes by name', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) }) } as any)

    const { result } = renderHook(() => useChannelNpcs('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const npc = { id: 'n1', channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://x/a.png', created_at: '' }
    act(() => {
      result.current.addNpc(npc)
      result.current.addNpc({ ...npc, name: 'goblin king' })
      result.current.addNpc({ id: 'n2', channel_id: 'c1', name: 'Dragon', avatar_url: 'https://x/b.png', created_at: '' })
    })

    expect(result.current.npcs.map(n => n.name)).toEqual(['Dragon', 'Goblin King'])
  })
})
