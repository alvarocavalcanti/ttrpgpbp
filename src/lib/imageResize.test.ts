import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeResizedDimensions, resizeImageFile } from './imageResize'

describe('computeResizedDimensions', () => {
  it('keeps dimensions when already within the cap', () => {
    expect(computeResizedDimensions(300, 200, 512)).toEqual({ width: 300, height: 200 })
  })

  it('downscales the larger dimension to the cap preserving aspect ratio', () => {
    expect(computeResizedDimensions(1600, 900, 512)).toEqual({ width: 512, height: 288 })
  })

  it('downscales when only one dimension exceeds the cap', () => {
    expect(computeResizedDimensions(200, 1000, 512)).toEqual({ width: 102, height: 512 })
  })

  it('never upscales', () => {
    expect(computeResizedDimensions(10, 10, 512)).toEqual({ width: 10, height: 10 })
  })

  it('handles zero dimensions without dividing by zero', () => {
    expect(computeResizedDimensions(0, 0, 512)).toEqual({ width: 0, height: 0 })
  })
})

describe('resizeImageFile', () => {
  const createBitmap = vi.fn()
  const drawImage = vi.fn()

  beforeEach(() => {
    createBitmap.mockReset()
    drawImage.mockReset()
    createBitmap.mockResolvedValue({ width: 1600, height: 900, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', createBitmap)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(['fake'], { type: 'image/jpeg' }) as Blob)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downscales, re-encodes as JPEG, and returns a File', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    const resized = await resizeImageFile(file)

    expect(createBitmap).toHaveBeenCalledWith(file)
    expect(drawImage).toHaveBeenCalled()
    expect(resized.type).toBe('image/jpeg')
    expect(resized.name).toBe('photo.jpg')
  })

  it('throws when the canvas context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(resizeImageFile(new File(['x'], 'x.png'))).rejects.toThrow('Canvas 2D context unavailable')
  })

  it('throws when encoding produces no blob', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(null)
    })
    await expect(resizeImageFile(new File(['x'], 'x.png'))).rejects.toThrow('Image encoding failed')
  })
})
