import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useActivePlayers } from './useActivePlayers'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn() }
}))

describe('useActivePlayers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('setActivePlayers calls the RPC with the selected ids and returns the error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)
    await expect(useActivePlayers().setActivePlayers('c1', ['u1', 'u2'])).resolves.toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('set_active_players', {
      p_channel_id: 'c1',
      p_active_player_ids: ['u1', 'u2'],
    })
  })

  it('setActivePlayers surfaces the error', async () => {
    const err = new Error('denied')
    vi.mocked(supabase.rpc).mockResolvedValue({ error: err } as any)
    await expect(useActivePlayers().setActivePlayers('c1', [])).resolves.toBe(err)
  })
})
