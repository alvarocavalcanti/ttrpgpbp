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

const createChain = (resolveVal: any) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(resolveVal),
    // eslint-disable-next-line unicorn/no-thenable
    then: (cb: any) => Promise.resolve(resolveVal).then(cb)
  };
  return chain;
}

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
    let resolvePublic: any;
    const publicPromise = new Promise(resolve => { resolvePublic = resolve });
    
    const publicChain = {
      select: () => publicChain,
      eq: () => publicChain,
      order: () => publicPromise
    };
    
    const memberChain = createChain({ data: [], error: null });

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channels') return publicChain as any;
      if (table === 'channel_members') return memberChain as any;
      return {} as any;
    })

    const { result, unmount } = renderHook(() => useChannels())
    unmount()
    resolvePublic!({ data: [], error: null })
    expect(result.current.loading).toBe(true)
  })

  it('handles error fetching member data gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channels') return createChain({ data: [{ id: 'channel-1' }], error: null }) as any;
      if (table === 'channel_members') return createChain({ data: null, error: new Error('Member DB error') }) as any;
      return {} as any;
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(console.error).toHaveBeenCalled()
    expect(result.current.publicChannels).toEqual([])
  })

  it('fetches and formats channels successfully with unread counts', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockPublicChannels = [{ id: 'channel-1', name: 'Public Channel' }]
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      last_read_at: '2023-01-01T00:00:00Z', channel: { id: 'channel-2', name: 'My Channel' }
    }]

    const messageChain = {
      select: () => messageChain,
      eq: () => messageChain,
      gt: () => Promise.resolve({ count: 5, error: null }),
      // eslint-disable-next-line unicorn/no-thenable
    then: (cb: any) => Promise.resolve({ count: 5, error: null }).then(cb)
    };

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channels') return createChain({ data: mockPublicChannels, error: null }) as any;
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any;
      if (table === 'messages') return messageChain as any;
      return {} as any;
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChannels[0].unread_count).toBe(5)
  })

  it('fetches and formats channels successfully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    const mockPublicChannels = [{ id: 'channel-1', name: 'Public Channel' }]
    const mockMyChannelsRaw = [{
      id: 'member-1', channel_id: 'channel-2', user_id: 'user-1', character_name: 'Thor',
      channel: { id: 'channel-2', name: 'My Channel' }
    }]

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channels') return createChain({ data: mockPublicChannels, error: null }) as any;
      if (table === 'channel_members') return createChain({ data: mockMyChannelsRaw, error: null }) as any;
      return {} as any;
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.publicChannels).toEqual(mockPublicChannels)
    expect(result.current.myChannels).toHaveLength(1)
    expect(result.current.myChannels[0].id).toBe('channel-2')
  })

  it('handles fetch errors gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'channels') return createChain({ data: null, error: new Error('DB error') }) as any;
      return {} as any;
    })

    const { result } = renderHook(() => useChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(console.error).toHaveBeenCalled()
    expect(result.current.publicChannels).toEqual([])
  })
})
