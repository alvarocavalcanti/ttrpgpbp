import type { ImgHTMLAttributes } from 'react'
import { useSignedImageUrl } from '../hooks/useSignedImageUrl'

interface SignedImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Reserve the image's box from the intrinsic size stored at upload, so late
   * bytes never shift the layout. Opt-in for content images (message images,
   * maps); leave off for fixed-size avatars/thumbnails, which already have a
   * definite box. No-op when the size is unknown (external or legacy images).
   */
  reserveBox?: boolean
}

// <img> that resolves a stored value (external URL or private-bucket object
// path) to a displayable src before rendering. Bucket paths are signed; while
// a signed URL is pending a placeholder box (carrying the same className) is
// shown so the image area stays mounted and late-arriving images don't shift
// the surrounding layout. Nothing renders when there is no value at all.
export function SignedImg({ src, alt, className, style, reserveBox = false, ...props }: SignedImgProps) {
  const { src: resolved, loading, width, height } = useSignedImageUrl(src, reserveBox)

  if (!src) return null

  // Known intrinsic size → reserve the exact box. `width: min(100%, Wpx)` makes
  // the placeholder match the loaded <img>, which renders at
  // min(intrinsic width, container width).
  const dims = reserveBox && width && height ? { width, height } : null

  if (loading || !resolved) {
    return (
      <div
        className={className}
        style={dims
          ? { aspectRatio: `${dims.width} / ${dims.height}`, width: `min(100%, ${dims.width}px)` }
          : undefined}
        role="img"
        aria-label={alt || 'Image'}
        data-testid="signed-img-loading"
      />
    )
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      {...(dims ? { width: dims.width, height: dims.height } : {})}
      {...props}
      style={dims ? { aspectRatio: `${dims.width} / ${dims.height}`, ...style } : style}
    />
  )
}
