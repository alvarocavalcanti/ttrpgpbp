import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCreateChannel } from './useCreateChannel'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

describe('useCreateChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('countMyChannels counts non-archived memberships', async () => {
    const eq = vi.fn().mockResolvedValue({ count: 3, error: null })
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq }) })
    vi.mocked(supabase.from).mockReturnValue({ select } as any)

    await expect(useCreateChannel().countMyChannels('u1')).resolves.toBe(3)
    expect(supabase.from).toHaveBeenCalledWith('channel_members')
    expect(select).toHaveBeenCalledWith('*, channel:channels!inner(id)', { count: 'exact', head: true })
  })

  it('countMyChannels resolves 0 when the count is null', async () => {
    const eq = vi.fn().mockResolvedValue({ count: null, error: null })
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq }) })
    vi.mocked(supabase.from).mockReturnValue({ select } as any)

    await expect(useCreateChannel().countMyChannels('u1')).resolves.toBe(0)
  })

  it('createChannel calls the create RPC and resolves the channel id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'c1', error: null } as any)

    const params = { name: 'New Game', gameSystem: 'none', inviteCode: '12345678', characterName: 'GM' }
    await expect(useCreateChannel().createChannel(params)).resolves.toBe('c1')
    expect(supabase.rpc).toHaveBeenCalledWith('create_channel', {
      p_name: 'New Game',
      p_game_system: 'none',
      p_invite_code: '12345678',
      p_character_name: 'GM',
      p_password_hash: undefined,
      p_password_salt: undefined
    })
  })

  it('createChannel throws on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('RPC failed') } as any)
    await expect(useCreateChannel().createChannel({ name: 'x', gameSystem: 'none', inviteCode: 'c', characterName: 'GM' })).rejects.toThrow('RPC failed')
  })

  it('createChannel throws when no channel id comes back', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
    await expect(useCreateChannel().createChannel({ name: 'x', gameSystem: 'none', inviteCode: 'c', characterName: 'GM' })).rejects.toThrow('Failed to create channel')
  })
})
