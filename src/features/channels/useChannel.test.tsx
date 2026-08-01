import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannel } from './useChannel'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    })
  }
}))

describe('useChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early if no user or no channel id', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    
    const { result } = renderHook(() => useChannel('123'))
    
    expect(result.current.loading).toBe(false)
    expect(result.current.channel).toBeNull()
  })

  it('fetches channel and members', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.channel).toEqual(mockChannel)
    expect(result.current.members[0].profile?.display_name).toBe('Hero')
    expect(result.current.isGM).toBe(true)
    expect(result.current.myMemberInfo).toBeDefined()
  })

  it('handles error gracefully when members fetch fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: null, error: new Error('Member DB Error') })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(console.error).toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
  })

  it('handles error gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    vi.mocked(supabase.from).mockReturnValue({ select: mockSelectChannel } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(console.error).toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
  })

  it('handles last_read_at update failure gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const mockChannel = { id: 'c1', gm_id: 'u1' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })
    
    const mockEqUpdate = vi.fn().mockResolvedValue({ error: new Error('Update failed') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') {
        return { 
          select: mockSelectMembers,
          update: mockUpdate
        } as any
      }
      return {} as any
    })

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to update last_read_at', expect.any(Error))
    })
  })

  it('handles realtime updates', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    const mockChannel = { id: 'c1', gm_id: 'u1', status_text: 'Old' }
    const mockMembers = [{ id: 'm1', user_id: 'u1', is_active_player: false, profile: { display_name: 'Hero' } }]

    const mockSingle = vi.fn().mockResolvedValue({ data: mockChannel, error: null })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelectChannel = vi.fn().mockReturnValue({ eq: mockEqChannel })

    const mockEqMembers = vi.fn().mockResolvedValue({ data: mockMembers, error: null })
    const mockSelectMembers = vi.fn().mockReturnValue({ eq: mockEqMembers })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { select: mockSelectChannel } as any
      if (table === 'channel_members') return { select: mockSelectMembers } as any
      return {} as any
    })

    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
    let channelCallback: any
    let membersCallback: any

    const mockOn = vi.fn().mockImplementation((_event, config, callback) => {
      if (config.table === 'channels') {
        channelCallback = callback
      } else if (config.table === 'channel_members') {
        membersCallback = callback
      }
      return { on: mockOn, subscribe: mockSubscribe }
    })

    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)

    const { result } = renderHook(() => useChannel('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Simulate channel update
    import('react').then(React => {
        const { act } = React
        act(() => {
          channelCallback({ new: { status_text: 'New' } })
          membersCallback({ new: { id: 'm1', is_active_player: true } })
        })
    })

    await waitFor(() => {
        expect(result.current.channel?.status_text).toBe('New')
        expect(result.current.members[0].is_active_player).toBe(true)
    })
  })
})
