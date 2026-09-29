import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProfileAvatar } from './useProfileAvatar'
import { supabase } from '../../lib/supabase'
import { resizeImageFile } from '../../lib/imageResize'
import { useAppSetting } from '../../hooks/useAppSetting'
import { updateAvatarUrl } from './authApi'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}))

vi.mock('../../lib/imageResize', () => ({
  resizeImageFile: vi.fn(),
}))

vi.mock('../../hooks/useAppSetting', () => ({
  useAppSetting: vi.fn(),
}))

vi.mock('./authApi', () => ({
  updateAvatarUrl: vi.fn(),
}))

const USER_ID = '11111111-2222-3333-4444-555555555555'
const makeFile = (size: number, type = 'image/png') => new File([new Uint8Array(size)], 'photo.png', { type })

describe('useProfileAvatar', () => {
  const mockInvoke = vi.fn()
  const onUpdated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({ data: { status: 'stored' }, error: null })
    vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke)
    vi.mocked(resizeImageFile).mockResolvedValue({
      file: new File(['resized'], 'photo.jpg', { type: 'image/jpeg' }),
      width: 512,
      height: 512,
    })
    vi.mocked(updateAvatarUrl).mockResolvedValue({ error: null } as any)
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: true, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })
  })

  it('uploads a resized profile picture and persists the returned path', async () => {
    const { result } = renderHook(() => useProfileAvatar(USER_ID, onUpdated))

    const path = await result.current.uploadAvatar(makeFile(1024))

    expect(resizeImageFile).toHaveBeenCalledWith(expect.any(File), 512)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('upload-image', { body: expect.any(FormData) })
    const form = mockInvoke.mock.calls[0][1].body as FormData
    expect(form.get('path')).toBe(path)
    expect(form.get('path')).toMatch(new RegExp(`^${USER_ID}/profile/.+\\.jpg$`))
    expect(form.get('scope')).toBe('profile')
    expect(form.get('width')).toBe('512')
    expect(form.get('height')).toBe('512')
    expect(updateAvatarUrl).toHaveBeenCalledWith(USER_ID, path)
    expect(onUpdated).toHaveBeenCalled()
    expect(result.current.uploading).toBe(false)
  })

  it('throws a generic failure when the store status is missing', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useProfileAvatar(USER_ID))

    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('Image upload failed. Please try again.')
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })

  it('propagates edge function errors before touching the profile', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('function down') })
    const { result } = renderHook(() => useProfileAvatar(USER_ID))

    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('Image upload failed. Please try again.')
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })

  it('propagates profile persistence failures', async () => {
    vi.mocked(updateAvatarUrl).mockRejectedValue(new Error('Database down'))
    const { result } = renderHook(() => useProfileAvatar(USER_ID, onUpdated))

    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('Database down')
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('rejects non-image files', async () => {
    const { result } = renderHook(() => useProfileAvatar(USER_ID))

    await expect(result.current.uploadAvatar(makeFile(10, 'text/plain'))).rejects.toThrow('Please choose an image file.')
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })

  it('rejects when uploads are disabled by the admin', async () => {
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: false, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })

    const { result } = renderHook(() => useProfileAvatar(USER_ID))

    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('disabled by the server admin')
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })

  it('rejects files over the configured size cap', async () => {
    const { result } = renderHook(() => useProfileAvatar(USER_ID))

    await expect(result.current.uploadAvatar(makeFile(5 * 1024 * 1024 + 1))).rejects.toThrow('too large')
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })

  it('returns null when there is no user id', async () => {
    const { result } = renderHook(() => useProfileAvatar(undefined))

    await expect(result.current.uploadAvatar(makeFile(1024))).resolves.toBeNull()
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })
})
