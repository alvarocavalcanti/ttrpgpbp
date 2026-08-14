const DEFAULT_MAX_DIMENSION = 512
const JPEG_QUALITY = 0.8

// Pixel dimensions for downscaling. Only ever shrinks: images already at or
// below the cap keep their size so we don't upscale and bloat storage.
export function computeResizedDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height }
  }
  const scale = Math.min(maxDimension / width, maxDimension / height, 1)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

// Client-side downscale + JPEG re-encode before upload. Runs in the browser so
// a multi-MB phone photo becomes ~100-200 KB at zero server cost (Supabase's
// server-side transforms require the paid plan).
export async function resizeImageFile(file: File, maxDimension = DEFAULT_MAX_DIMENSION): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = computeResizedDimensions(bitmap.width, bitmap.height, maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas 2D context unavailable')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
  if (!blob) throw new Error('Image encoding failed')

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}
