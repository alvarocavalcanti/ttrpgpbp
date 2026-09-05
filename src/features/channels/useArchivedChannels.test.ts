import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useArchivedChannels } from './useArchivedChannels'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

const archivedRow = { id: '1', name: 'Archived', created_at: '2023-01-01' }

function mockFrom({ data, error, updateError }: { data?: any[] | null, error?: any, updateError?: any } = {}) {
  const mockOrder = vi.fn().mockResolvedValue({ data, error })
  const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
  const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
  const mockUpdateEq = vi.fn().mockResolvedValue({ error: updateError })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: mockEq1 }),
    update: mockUpdate
  } as any)
  return { mockUpdate, mockUpdateEq }
}

describe('useArchivedChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the GM archived channels', async () => {
    mockFrom({ data: [archivedRow], error: null })
    const { result } = renderHook(() => useArchivedChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.archivedChannels).toEqual([archivedRow])
    expect(result.current.error).toBeNull()
  })

  it('surfaces a fetch error', async () => {
    mockFrom({ data: null, error: new Error('DB error') })
    const { result } = renderHook(() => useArchivedChannels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load archived channels.')
  })

  it('stays loading without a user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const { result } = renderHook(() => useArchivedChannels())
    expect(result.current.loading).toBe(true)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('restoreChannel updates the row and drops it from the list', async () => {
    mockFrom({ data: [archivedRow], error: null, updateError: null })
    const { result } = renderHook(() => useArchivedChannels())
    await waitFor(() => expect(result.current.archivedChannels).toHaveLength(1))

    await act(async () => {
      await expect(result.current.restoreChannel('1')).resolves.toBe(true)
    })
    expect(result.current.archivedChannels).toEqual([])
  })

  it('restoreChannel surfaces the error and keeps the row', async () => {
    mockFrom({ data: [archivedRow], error: null, updateError: new Error('DB Error') })
    const { result } = renderHook(() => useArchivedChannels())
    await waitFor(() => expect(result.current.archivedChannels).toHaveLength(1))

    await act(async () => {
      await expect(result.current.restoreChannel('1')).resolves.toBe(false)
    })
    expect(result.current.error).toBe('Failed to restore channel.')
    expect(result.current.archivedChannels).toEqual([archivedRow])
  })
})
