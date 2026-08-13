import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIsServerAdmin } from './useIsServerAdmin'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('useIsServerAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts loading and resolves to true for an admin', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as any)

    const { result } = renderHook(() => useIsServerAdmin())

    expect(result.current.loading).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('is_server_admin')

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.isServerAdmin).toBe(true)
    })
  })

  it('resolves to false for a non-admin', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as any)

    const { result } = renderHook(() => useIsServerAdmin())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.isServerAdmin).toBe(false)
    })
  })

  it('resolves to false and finishes loading when the RPC fails', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('DB down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useIsServerAdmin())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.isServerAdmin).toBe(false)
    })
  })
})
