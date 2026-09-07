import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUpdateChannelSettings } from './useUpdateChannelSettings'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('useUpdateChannelSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the params straight through to the update_channel_settings RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    const params = {
      p_channel_id: 'c1',
      p_name: 'Renamed Channel',
      p_game_system: 'dnd5e',
      p_map_url: undefined,
      p_clear_password: false
    }
    await expect(useUpdateChannelSettings().updateChannelSettings(params)).resolves.toEqual({
      data: null,
      error: null
    })
    expect(supabase.rpc).toHaveBeenCalledWith('update_channel_settings', params)
  })

  it('resolves with the RPC error so the caller keeps its throw/toast flow', async () => {
    const rpcError = new Error('update failed')
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: rpcError } as any)

    const { error } = await useUpdateChannelSettings().updateChannelSettings({ p_channel_id: 'c1' })
    expect(error).toBe(rpcError)
  })

  it('rejects when the RPC call itself rejects', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network down'))

    await expect(
      useUpdateChannelSettings().updateChannelSettings({ p_channel_id: 'c1' })
    ).rejects.toThrow('network down')
  })
})
