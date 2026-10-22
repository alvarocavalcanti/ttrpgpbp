import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelStatus } from './useChannelStatus'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('useChannelStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the Main status through the update_channel_status RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    await expect(useChannelStatus().updateStatus('c1', 'On the road')).resolves.toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('update_channel_status', {
      p_channel_id: 'c1',
      p_status_text: 'On the road',
      p_sub_channel_id: undefined
    })
  })

  it('scopes the update to a room when a room id is given', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    await expect(useChannelStatus().updateStatus('c1', 'Room status', 'r1')).resolves.toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('update_channel_status', {
      p_channel_id: 'c1',
      p_status_text: 'Room status',
      p_sub_channel_id: 'r1'
    })
  })

  it('forwards a blank status verbatim; the RPC normalizes it to NULL', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    await useChannelStatus().updateStatus('c1', '')
    expect(supabase.rpc).toHaveBeenCalledWith('update_channel_status', {
      p_channel_id: 'c1',
      p_status_text: '',
      p_sub_channel_id: undefined
    })
  })

  it('returns the RPC error so the caller keeps its throw flow', async () => {
    const rpcError = new Error('update failed')
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: rpcError } as any)

    await expect(useChannelStatus().updateStatus('c1', 'x')).resolves.toBe(rpcError)
  })
})
