import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAdminArchivedChannels } from './useAdminArchivedChannels'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const baseRow = {
  id: 'c1', name: 'Archived Quest', game_system: 'dnd5e', gm_id: 'u1',
  gm_display_name: 'Gina GM', gm_email: 'gina@example.com', member_count: 2,
  player_characters: ['Pete the Rogue'], created_at: '2026-01-01T00:00:00Z',
  last_message_at: null,
}

describe('useAdminArchivedChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('issues no RPC for non-admins and settles empty', async () => {
    const { result } = renderHook(() => useAdminArchivedChannels(false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(result.current.archivedChannels).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('fetches and parses archived channels for admins', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ ...baseRow }], error: null } as any)
    const { result } = renderHook(() => useAdminArchivedChannels(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_archived_channels')
    expect(result.current.archivedChannels).toEqual([{ ...baseRow }])
    expect(result.current.error).toBeNull()
  })

  it('keeps valid rows and drops malformed ones', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ ...baseRow }, null, { ...baseRow, id: 42 }, { ...baseRow, id: 'c2', gm_id: null, gm_display_name: null, gm_email: null, player_characters: [] }],
      error: null,
    } as any)
    const { result } = renderHook(() => useAdminArchivedChannels(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.archivedChannels).toEqual([
      { ...baseRow },
      { ...baseRow, id: 'c2', gm_id: null, gm_display_name: null, gm_email: null, player_characters: [] },
    ])
    expect(result.current.error).toBeNull()
  })

  it('surfaces a load error when the RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('DB down') } as any)
    const { result } = renderHook(() => useAdminArchivedChannels(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load archived channels.')
    expect(result.current.archivedChannels).toEqual([])
  })

  it('surfaces a load error when the RPC promise rejects', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useAdminArchivedChannels(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load archived channels.')
  })

  it('surfaces a load error on a non-array payload', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { rows: [] }, error: null } as any)
    const { result } = renderHook(() => useAdminArchivedChannels(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load archived channels.')
    expect(result.current.archivedChannels).toEqual([])
  })

  it('refetch re-issues the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ ...baseRow }], error: null } as any)
    const { result } = renderHook(() => useAdminArchivedChannels(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    result.current.refetch()
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2))
  })
})
