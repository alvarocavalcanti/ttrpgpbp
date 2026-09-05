import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMemberModeration } from './useMemberModeration'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

describe('useMemberModeration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('moderateMember calls the moderation RPC and returns the error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)
    await expect(useMemberModeration().moderateMember('c1', 'm2', 'block')).resolves.toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('moderate_member', {
      p_channel_id: 'c1',
      p_member_id: 'm2',
      p_action: 'block'
    })
  })

  it('moderateMember surfaces the error', async () => {
    const err = new Error('DB Error')
    vi.mocked(supabase.rpc).mockResolvedValue({ error: err } as any)
    await expect(useMemberModeration().moderateMember('c1', 'm2', 'kick')).resolves.toBe(err)
  })

  it('setAway updates the member row and returns the error', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useMemberModeration().setAway('m2', true, 'Back on Thursday')).resolves.toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('channel_members')
    expect(update).toHaveBeenCalledWith({ is_away: true, away_message: 'Back on Thursday' })
    expect(eq).toHaveBeenCalledWith('id', 'm2')
  })

  it('setAway surfaces the error', async () => {
    const err = new Error('DB Error')
    const eq = vi.fn().mockResolvedValue({ error: err })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useMemberModeration().setAway('m2', false, null)).resolves.toBe(err)
    expect(update).toHaveBeenCalledWith({ is_away: false, away_message: null })
  })
})
