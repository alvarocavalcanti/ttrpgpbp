import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePublicChannelApply } from './usePublicChannelApply'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

const detailRow = {
  id: '123',
  name: 'Listed Game',
  gm_display_name: 'Aria',
  game_system: 'shadowdark',
  description: 'A weekly game.',
  constraints: 'Be kind.',
  member_count: 3,
  last_message_at: '2026-10-01T10:00:00Z',
  application_prompt: 'Why join?',
  is_member: false,
  pending_request_id: null,
}

describe('usePublicChannelApply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the detail projection', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [detailRow], error: null } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('get_public_channel', { p_channel_id: '123' })
    expect(result.current.detail).toMatchObject({ id: '123', application_prompt: 'Why join?' })
    expect(result.current.error).toBeNull()
  })

  it('returns no detail when the listing is gone', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.detail).toBeNull()
  })

  it('surfaces a detail fetch error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('boom') } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.detail).toBeNull()
  })

  it('skips the query without a channel id', () => {
    const { result } = renderHook(() => usePublicChannelApply(null))
    expect(result.current.loading).toBe(false)
    expect(result.current.detail).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('drops a malformed detail row', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ description: 'no id' }], error: null } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.detail).toBeNull()
  })

  it('apply sends the application and refetches the detail', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [detailRow], error: null } as any)
      .mockResolvedValueOnce({ data: null, error: null } as any)
      .mockResolvedValueOnce({ data: [{ ...detailRow, pending_request_id: 'req-1' }], error: null } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.detail).not.toBeNull())

    await act(async () => {
      await result.current.apply('Aria', 'I would love to join.')
    })

    expect(supabase.rpc).toHaveBeenCalledWith('request_to_join_channel', {
      p_channel_id: '123',
      p_character_name: 'Aria',
      p_message: 'I would love to join.',
    })
    await waitFor(() => expect(result.current.detail?.pending_request_id).toBe('req-1'))
    expect(result.current.busy).toBe(false)
  })

  it('apply omits a blank answer', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [detailRow], error: null } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.detail).not.toBeNull())

    await act(async () => {
      await result.current.apply('Aria', '')
    })

    expect(supabase.rpc).toHaveBeenCalledWith('request_to_join_channel', {
      p_channel_id: '123',
      p_character_name: 'Aria',
      p_message: undefined,
    })
  })

  it('apply rethrows an RPC error', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [detailRow], error: null } as any)
      .mockResolvedValueOnce({ data: null, error: new Error('already applied') } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.detail).not.toBeNull())

    await act(async () => {
      await expect(result.current.apply('Aria', 'again')).rejects.toThrow('already applied')
    })
    expect(result.current.busy).toBe(false)
  })

  it('withdraw calls the RPC and clears the pending state', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [{ ...detailRow, pending_request_id: 'req-1' }], error: null } as any)
      .mockResolvedValueOnce({ data: null, error: null } as any)
      .mockResolvedValueOnce({ data: [detailRow], error: null } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.detail?.pending_request_id).toBe('req-1'))

    await act(async () => {
      await result.current.withdraw('req-1')
    })

    expect(supabase.rpc).toHaveBeenCalledWith('withdraw_join_request', { p_request_id: 'req-1' })
    await waitFor(() => expect(result.current.detail?.pending_request_id).toBeNull())
  })

  it('withdraw rethrows an RPC error', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [{ ...detailRow, pending_request_id: 'req-1' }], error: null } as any)
      .mockResolvedValueOnce({ data: null, error: new Error('nothing to withdraw') } as any)

    const { result } = renderHook(() => usePublicChannelApply('123'))
    await waitFor(() => expect(result.current.detail).not.toBeNull())

    await act(async () => {
      await expect(result.current.withdraw('req-1')).rejects.toThrow('nothing to withdraw')
    })
  })
})
