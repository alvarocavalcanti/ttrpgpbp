import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useImageUpload } from './useImageUpload'
import { supabase } from '../lib/supabase'
import { resizeImageFile } from '../lib/imageResize'
import { useAppSetting } from './useAppSetting'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}))

vi.mock('../lib/imageResize', () => ({
  resizeImageFile: vi.fn(),
}))

vi.mock('./useAppSetting', () => ({
  useAppSetting: vi.fn(),
}))

const makeFile = (size: number, type = 'image/png') => new File([new Uint8Array(size)], 'photo.png', { type })

describe('useImageUpload', () => {
  const mockUpload = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue({ error: null })
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: mockUpload,
    } as any)
    vi.mocked(resizeImageFile).mockResolvedValue(new File(['resized'], 'photo.jpg', { type: 'image/jpeg' }))
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: true, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })
  })

  it('uploads a resized image into the channel folder and returns the object path', async () => {
    const { result } = renderHook(() => useImageUpload('c1'))

    const path = await result.current.uploadImage(makeFile(1024), 'message', 1200)

    expect(resizeImageFile).toHaveBeenCalledWith(expect.any(File), 1200)
    const uploadPath = mockUpload.mock.calls[0][0]
    expect(uploadPath).toMatch(/^c1\/message\/.+\.jpg$/)
    expect(path).toBe(uploadPath)
    expect(result.current.uploading).toBe(false)
  })

  it('rejects non-image files', async () => {
    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(10, 'text/plain'), 'message')).rejects.toThrow('Please choose an image file.')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects when uploads are disabled by the admin', async () => {
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: false, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })

    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(1024), 'message')).rejects.toThrow('disabled by the server admin')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects files over the configured size cap', async () => {
    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(5 * 1024 * 1024 + 1), 'message')).rejects.toThrow('too large')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('propagates storage upload errors', async () => {
    mockUpload.mockResolvedValue({ error: new Error('storage down') })
    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(1024), 'message')).rejects.toThrow('storage down')
  })

  it('returns null when there is no channel id', async () => {
    const { result } = renderHook(() => useImageUpload(undefined))
    await expect(result.current.uploadImage(makeFile(1024), 'message')).resolves.toBeNull()
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
