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

  it('updates the status through the update_channel_status RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    await expect(useChannelStatus().updateStatus('c1', 'On the road')).resolves.toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('update_channel_status', {
      p_channel_id: 'c1',
      p_status_text: 'On the road'
    })
  })

  it('forwards a blank status verbatim; the RPC normalizes it to NULL', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    await useChannelStatus().updateStatus('c1', '')
    expect(supabase.rpc).toHaveBeenCalledWith('update_channel_status', {
      p_channel_id: 'c1',
      p_status_text: ''
    })
  })

  it('returns the RPC error so the caller keeps its throw flow', async () => {
    const rpcError = new Error('update failed')
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: rpcError } as any)

    await expect(useChannelStatus().updateStatus('c1', 'x')).resolves.toBe(rpcError)
  })
})
