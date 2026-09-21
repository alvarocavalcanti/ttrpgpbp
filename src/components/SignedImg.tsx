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
  const { src: resolved, loading, width, height, error } = useSignedImageUrl(src, reserveBox)

  if (!src) return null

  // Known intrinsic size → reserve the exact box. `width: min(100%, Wpx)` makes
  // the placeholder match the loaded <img>, which renders at
  // min(intrinsic width, container width).
  //
  // Unknown size (external/legacy image, or a failed lookup) reserves nothing:
  // a fallback box would reflow when the real size replaced it, which is the
  // shift this prop exists to avoid. The message list's scroll anchoring
  // absorbs those cases instead.
  const dims = reserveBox && width && height ? { width, height } : null

  if (error) {
    // A failed sign used to render the loading placeholder forever. Keep the
    // caller's box (no layout shift) but say the image is unavailable. No
    // Retry here: this renders for dozens of inline avatars and thumbnails.
    // Message images are already one tap from recovery — they sit inside a
    // "View fullscreen" button that opens ImageViewerModal, which has the
    // Retry (issue #561).
    // ponytail: the label clips inside tiny fixed boxes (h-8 avatars); the
    // aria-label carries the meaning there. A per-size fallback is the
    // upgrade path if avatar failures ever need visible text.
    return (
      <div
        className={`${className ?? ''} flex items-center justify-center overflow-hidden text-center text-xs text-surface-500 dark:text-surface-400`}
        style={dims
          ? { aspectRatio: `${dims.width} / ${dims.height}`, width: `min(100%, ${dims.width}px)` }
          : undefined}
        role="img"
        aria-label={alt ? `${alt} — couldn't load` : "Image couldn't load"}
        data-testid="signed-img-error"
      >
        Couldn't load image
      </div>
    )
  }

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

  // Caller props first: the reserved dimensions below win when known, so the
  // loaded <img> can never differ from the placeholder's box.
  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      {...props}
      {...(dims ? { width: dims.width, height: dims.height } : {})}
      style={dims ? { aspectRatio: `${dims.width} / ${dims.height}`, ...style } : style}
    />
  )
}
