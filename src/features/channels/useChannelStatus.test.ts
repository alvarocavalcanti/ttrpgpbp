import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelStatus } from './useChannelStatus'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('useChannelStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates status_text on the channel row', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useChannelStatus().updateStatus('c1', 'On the road')).resolves.toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('channels')
    expect(update).toHaveBeenCalledWith({ status_text: 'On the road' })
    expect(eq).toHaveBeenCalledWith('id', 'c1')
  })

  it('stores null for a blank status', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await useChannelStatus().updateStatus('c1', '')
    expect(update).toHaveBeenCalledWith({ status_text: null })
  })

  it('returns the update error so the caller keeps its throw flow', async () => {
    const updateError = new Error('update failed')
    const eq = vi.fn().mockResolvedValue({ error: updateError })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useChannelStatus().updateStatus('c1', 'x')).resolves.toBe(updateError)
  })
})
