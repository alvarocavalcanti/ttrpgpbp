import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelAvatar } from './useChannelAvatar'
import { supabase } from '../../lib/supabase'
import { resizeImageFile } from '../../lib/imageResize'
import { useAppSetting } from '../../hooks/useAppSetting'

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

const makeFile = (size: number) => new File([new Uint8Array(size)], 'photo.png', { type: 'image/png' })

describe('useChannelAvatar', () => {
  const mockInvoke = vi.fn()
  const mockEq = vi.fn()
  const mockUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({ data: { status: 'stored' }, error: null })
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'channels') return { update: mockUpdate } as any
      return {} as any
    })
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

  it('uploads a resized avatar and persists the object path', async () => {
    const onUpdated = vi.fn()
    const { result } = renderHook(() => useChannelAvatar('c1', onUpdated))

    const url = await result.current.uploadAvatar(makeFile(1024))

    expect(resizeImageFile).toHaveBeenCalled()
    expect(supabase.functions.invoke).toHaveBeenCalledWith('upload-image', { body: expect.any(FormData) })
    const form = mockInvoke.mock.calls[0][1].body as FormData
    const path = form.get('path')
    expect(path).toMatch(/^c1\/avatar\/.+\.jpg$/)
    expect(form.get('file')).toBeInstanceOf(File)
    expect(url).toBe(path)
    expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: path })
    expect(mockEq).toHaveBeenCalledWith('id', 'c1')
    expect(onUpdated).toHaveBeenCalled()
    expect(result.current.uploading).toBe(false)
  })

  it('rejects when uploads are disabled by the admin', async () => {
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      if (key === 'image_uploading_enabled') return { value: false, loading: false, error: null, refresh: vi.fn() }
      if (key === 'image_max_size_mb') return { value: 5, loading: false, error: null, refresh: vi.fn() }
      return { value: fallback, loading: false, error: null, refresh: vi.fn() }
    })

    const { result } = renderHook(() => useChannelAvatar('c1'))
    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('disabled by the server admin')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('rejects files over the configured size cap', async () => {
    const { result } = renderHook(() => useChannelAvatar('c1'))
    await expect(result.current.uploadAvatar(makeFile(5 * 1024 * 1024 + 1))).rejects.toThrow('too large')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('propagates scan upload errors', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('function down') })
    const { result } = renderHook(() => useChannelAvatar('c1'))
    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('Image upload failed')
  })

  it('propagates channel update errors', async () => {
    mockEq.mockResolvedValue({ error: new Error('RLS denied') })
    const { result } = renderHook(() => useChannelAvatar('c1'))
    await expect(result.current.uploadAvatar(makeFile(1024))).rejects.toThrow('RLS denied')
  })

  it('returns null when there is no channel id', async () => {
    const { result } = renderHook(() => useChannelAvatar(undefined))
    await expect(result.current.uploadAvatar(makeFile(1024))).resolves.toBeNull()
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
