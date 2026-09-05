import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelJoin } from './useChannelJoin'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

const previewRow = { id: '123', name: 'Test Channel', game_system: 'none', has_password: false }

describe('useChannelJoin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the channel preview', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [previewRow], error: null } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledWith('get_join_channel_preview', { p_channel_id: '123' })
    expect(result.current.channel).toEqual(previewRow)
    expect(result.current.error).toBeNull()
  })

  it('handles an empty preview (channel does not exist)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.channel).toBeNull()
  })

  it('surfaces a preview fetch error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('boom') } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.channel).toBeNull()
  })

  it('skips the preview query without a channel id', () => {
    const { result } = renderHook(() => useChannelJoin(undefined))
    expect(result.current.loading).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('getChannelSalt resolves the salt for salted channels', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'aabbccddeeff00112233445566778899', error: null } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.getChannelSalt('123')).resolves.toBe('aabbccddeeff00112233445566778899')
    expect(supabase.rpc).toHaveBeenCalledWith('get_channel_salt', { p_channel_id: '123' })
  })

  it('getChannelSalt resolves null for legacy salt-less channels', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.getChannelSalt('123')).resolves.toBeNull()
  })

  it('getChannelSalt throws on error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('boom') } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.getChannelSalt('123')).rejects.toThrow('boom')
  })

  it('joinChannel calls the join RPC and resolves the result', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { success: true }, error: null } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const params = { characterName: 'Thor', passwordHash: 'h', inviteCode: 'abc', characterAttributes: { STR: 2 } }
    await expect(result.current.joinChannel(params)).resolves.toEqual({ success: true })
    expect(supabase.rpc).toHaveBeenCalledWith('join_channel', {
      p_channel_id: '123',
      p_character_name: 'Thor',
      p_password_hash: 'h',
      p_invite_code: 'abc',
      p_character_attributes: { STR: 2 }
    })
  })

  it('joinChannel throws on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('join failed') } as any)
    const { result } = renderHook(() => useChannelJoin('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.joinChannel({ characterName: 'Thor', characterAttributes: {} })).rejects.toThrow('join failed')
  })

  it('joinChannel throws without a channel id', async () => {
    const { result } = renderHook(() => useChannelJoin(undefined))
    await expect(result.current.joinChannel({ characterName: 'Thor', characterAttributes: {} })).rejects.toThrow('Missing channel id.')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
