import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAdminData } from './useAdminData'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('useAdminData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin1' } as any,
      profile: { id: 'admin1', display_name: 'Admin' } as any,
    } as any)
  })

  it('fetches users, channels, and storage bytes in parallel', async () => {
    const users = [{ id: 'u1', display_name: 'Alice', email: 'a@x', channel_count: 1, created_at: '', is_suspended: false }]
    const channels = [{ id: 'c1', name: 'Strahd', game_system: 'none', gm_id: 'u1', member_count: 2, created_at: '', last_message_at: null, gm_display_name: 'Alice' }]
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_users') return Promise.resolve({ data: users, error: null })
      if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
      return Promise.resolve({ data: 2048, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_users')
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_channels')
    expect(supabase.rpc).toHaveBeenCalledWith('admin_get_image_storage_bytes')
    expect(result.current.users).toEqual(users)
    expect(result.current.channels).toEqual(channels)
    expect(result.current.storageBytes).toBe(2048)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a load error when any admin RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('DB down') } as any)
    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load admin data.')
    expect(result.current.users).toEqual([])
  })

  it('does not fetch when not a server admin', () => {
    renderHook(() => useAdminData(false))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('suspendUser calls the RPC and flips the user in place', async () => {
    const users = [{ id: 'u1', display_name: 'Alice', email: 'a@x', channel_count: 1, created_at: '', is_suspended: false }]
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_users') return Promise.resolve({ data: users, error: null })
      if (fn === 'admin_suspend_user') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.users).toHaveLength(1))

    await act(async () => {
      await expect(result.current.suspendUser('u1', true, 'Spamming')).resolves.toBeNull()
    })
    expect(supabase.rpc).toHaveBeenCalledWith('admin_suspend_user', {
      p_user_id: 'u1',
      p_suspend: true,
      p_reason: 'Spamming',
    })
    expect(result.current.users[0].is_suspended).toBe(true)
  })

  it('suspendUser surfaces the RPC error without mutating the list', async () => {
    const users = [{ id: 'u1', display_name: 'Alice', email: 'a@x', channel_count: 1, created_at: '', is_suspended: false }]
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_users') return Promise.resolve({ data: users, error: null })
      if (fn === 'admin_suspend_user') return Promise.resolve({ data: null, error: new Error('nope') })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.users).toHaveLength(1))

    await act(async () => {
      const err = await result.current.suspendUser('u1', true, 'Spamming')
      expect(err).toBeInstanceOf(Error)
    })
    expect(result.current.users[0].is_suspended).toBe(false)
  })

  it('claimChannel calls the RPC and stamps the admin as GM', async () => {
    const channels = [{ id: 'c2', name: 'Empty', game_system: 'none', gm_id: null, member_count: 0, created_at: '', last_message_at: null, gm_display_name: null }]
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
      if (fn === 'admin_claim_channel') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.channels).toHaveLength(1))

    await act(async () => {
      await expect(result.current.claimChannel('c2')).resolves.toBeNull()
    })
    expect(supabase.rpc).toHaveBeenCalledWith('admin_claim_channel', { p_channel_id: 'c2' })
    expect(result.current.channels[0].gm_id).toBe('admin1')
    expect(result.current.channels[0].gm_display_name).toBe('Admin')
  })

  it('claimChannel surfaces the RPC error', async () => {
    const channels = [{ id: 'c2', name: 'Empty', game_system: 'none', gm_id: null, member_count: 0, created_at: '', last_message_at: null, gm_display_name: null }]
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
      if (fn === 'admin_claim_channel') return Promise.resolve({ data: null, error: new Error('nope') })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.channels).toHaveLength(1))

    await act(async () => {
      const err = await result.current.claimChannel('c2')
      expect(err).toBeInstanceOf(Error)
    })
    expect(result.current.channels[0].gm_id).toBeNull()
  })

  it('upsertSettings writes app_settings rows with the key conflict target', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ upsert } as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.upsertSettings([{ key: 'max_channels_per_user', value: 15 }])).resolves.toBeNull()
    })
    expect(supabase.from).toHaveBeenCalledWith('app_settings')
    expect(upsert).toHaveBeenCalledWith([{ key: 'max_channels_per_user', value: 15 }], { onConflict: 'key' })
  })

  it('upsertSettings surfaces the error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
    const err = new Error('nope')
    const upsert = vi.fn().mockResolvedValue({ error: err })
    vi.mocked(supabase.from).mockReturnValue({ upsert } as any)

    const { result } = renderHook(() => useAdminData(true))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.upsertSettings([{ key: 'max_channels_per_user', value: 15 }])).resolves.toBe(err)
    })
  })
})
