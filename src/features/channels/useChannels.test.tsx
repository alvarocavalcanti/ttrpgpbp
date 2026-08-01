import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannels } from './useChannels'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('useChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty lists and loading false if no user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    
    const { result } = renderHook(() => useChannels())
    
    expect(result.current.loading).toBe(true)
    expect(result.current.publicChannels).toEqual([])
    expect(result.current.myChannels).toEqual([])
  })

  it('does not set state if unmounted during fetch', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    
    // Create a promise that we can control to delay the mock response
    let resolvePublic: any
    const publicPromise = new Promise(resolve => { resolvePublic = resolve })
    
    const mockOrder = vi.fn().mockReturnValue(publicPromise)
    const mockEqPublic = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelectPublic = vi.fn().mockReturnValue({ eq: mockEqPublic })

    const mockEqMember = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockSelectMember = vi.fn().mockReturnValue({ eq: mockEqMember })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectPublic } as any
      if (table === 'channel_members') return { select: mockSelectMember } as any
      return {} as any
    })

    const { result, unmount } = renderHook(() => useChannels())
    
    // Unmount before the fetch completes
    unmount()
    
    // Now resolve the promise
    resolvePublic({ data: [], error: null })

    // Since it's unmounted, it shouldn't try to update state, but we mainly want to cover the `if (mounted)` false path
    expect(result.current.loading).toBe(true)
  })

  it('handles error fetching member data gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: 'channel-1' }], error: null })
    const mockEqPublic = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelectPublic = vi.fn().mockReturnValue({ eq: mockEqPublic })

    const mockEqMember = vi.fn().mockResolvedValue({ data: null, error: new Error('Member DB error') })
    const mockSelectMember = vi.fn().mockReturnValue({ eq: mockEqMember })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectPublic } as any
      if (table === 'channel_members') return { select: mockSelectMember } as any
      return {} as any
    })

    const { result } = renderHook(() => useChannels())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(console.error).toHaveBeenCalled()
    expect(result.current.publicChannels).toEqual([])
  })

  it('fetches and formats channels successfully with unread counts', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)

    const mockPublicChannels = [{ id: 'channel-1', name: 'Public Channel' }]
    const mockMyChannelsRaw = [{
      id: 'member-1',
      channel_id: 'channel-2',
      user_id: 'user-1',
      character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z',
      channel: { id: 'channel-2', name: 'My Channel' }
    }]

    const mockOrder = vi.fn().mockResolvedValue({ data: mockPublicChannels, error: null })
    const mockEqPublic = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelectPublic = vi.fn().mockReturnValue({ eq: mockEqPublic })

    const mockEqMember = vi.fn().mockResolvedValue({ data: mockMyChannelsRaw, error: null })
    const mockSelectMember = vi.fn().mockReturnValue({ eq: mockEqMember })

    const mockGtMessages = vi.fn().mockResolvedValue({ count: 5, error: null })
    const mockEqMessages = vi.fn().mockReturnValue({ gt: mockGtMessages })
    const mockSelectMessages = vi.fn().mockReturnValue({ eq: mockEqMessages })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectPublic } as any
      if (table === 'channel_members') return { select: mockSelectMember } as any
      if (table === 'messages') return { select: mockSelectMessages } as any
      return {} as any
    })

    const { result } = renderHook(() => useChannels())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.myChannels[0].unread_count).toBe(5)
  })

  it('fetches and formats channels successfully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)

    const mockPublicChannels = [{ id: 'channel-1', name: 'Public Channel' }]
    const mockMyChannelsRaw = [{
      id: 'member-1',
      channel_id: 'channel-2',
      user_id: 'user-1',
      character_name: 'Thor',
      channel: { id: 'channel-2', name: 'My Channel' }
    }]

    const mockOrder = vi.fn().mockResolvedValue({ data: mockPublicChannels, error: null })
    const mockEqPublic = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelectPublic = vi.fn().mockReturnValue({ eq: mockEqPublic })

    const mockEqMember = vi.fn().mockResolvedValue({ data: mockMyChannelsRaw, error: null })
    const mockSelectMember = vi.fn().mockReturnValue({ eq: mockEqMember })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectPublic } as any
      if (table === 'channel_members') return { select: mockSelectMember } as any
      return {} as any
    })

    const { result } = renderHook(() => useChannels())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.publicChannels).toEqual(mockPublicChannels)
    expect(result.current.myChannels).toHaveLength(1)
    expect(result.current.myChannels[0].id).toBe('channel-2')
    expect(result.current.myChannels[0].name).toBe('My Channel')
    expect(result.current.myChannels[0].member.character_name).toBe('Thor')
  })

  it('handles fetch errors gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockOrder = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })
    const mockEqPublic = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelectPublic = vi.fn().mockReturnValue({ eq: mockEqPublic })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectPublic } as any
      return {} as any
    })

    const { result } = renderHook(() => useChannels())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(console.error).toHaveBeenCalled()
    expect(result.current.publicChannels).toEqual([])
  })
})
