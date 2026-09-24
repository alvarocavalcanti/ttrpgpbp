import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useImageUpload } from './useImageUpload'
import { supabase } from '../lib/supabase'
import { resizeImageFile } from '../lib/imageResize'
import { useAppSetting } from './useAppSetting'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
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
  const mockInvoke = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({ data: { status: 'stored' }, error: null })
    vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke)
    vi.mocked(resizeImageFile).mockResolvedValue({
      file: new File(['resized'], 'photo.jpg', { type: 'image/jpeg' }),
      width: 512,
      height: 288,
    })
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: true, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })
  })

  it('uploads a resized image and returns the object path', async () => {
    const { result } = renderHook(() => useImageUpload('c1'))

    const path = await result.current.uploadImage(makeFile(1024), 'message', 1200)

    expect(resizeImageFile).toHaveBeenCalledWith(expect.any(File), 1200)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('upload-image', { body: expect.any(FormData) })
    const form = mockInvoke.mock.calls[0][1].body as FormData
    expect(form.get('channelId')).toBe('c1')
    expect(form.get('path')).toBe(path)
    expect(form.get('path')).toMatch(/^c1\/message\/.+\.jpg$/)
    expect(form.get('width')).toBe('512')
    expect(form.get('height')).toBe('288')
    expect(result.current.uploading).toBe(false)
  })

  it('throws a generic failure when the store status is missing', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useImageUpload('c1'))

    await expect(result.current.uploadImage(makeFile(1024), 'message')).rejects.toThrow('Image upload failed')
  })

  it('propagates edge function errors', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('function down') })
    const { result } = renderHook(() => useImageUpload('c1'))

    await expect(result.current.uploadImage(makeFile(1024), 'message')).rejects.toThrow('Image upload failed')
  })

  it('rejects non-image files', async () => {
    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(10, 'text/plain'), 'message')).rejects.toThrow('Please choose an image file.')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('rejects when uploads are disabled by the admin', async () => {
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: false, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })

    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(1024), 'message')).rejects.toThrow('disabled by the server admin')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('rejects files over the configured size cap', async () => {
    const { result } = renderHook(() => useImageUpload('c1'))
    await expect(result.current.uploadImage(makeFile(5 * 1024 * 1024 + 1), 'message')).rejects.toThrow('too large')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('returns null when there is no channel id', async () => {
    const { result } = renderHook(() => useImageUpload(undefined))
    await expect(result.current.uploadImage(makeFile(1024), 'message')).resolves.toBeNull()
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
