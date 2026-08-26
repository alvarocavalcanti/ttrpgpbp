import type { ImgHTMLAttributes } from 'react'
import { useSignedImageUrl } from '../hooks/useSignedImageUrl'

// <img> that resolves a stored value (external URL or private-bucket object
// path) to a displayable src before rendering. Bucket paths are signed; while
// a signed URL is pending a placeholder box (carrying the same className) is
// shown so the image area stays mounted and late-arriving images don't shift
// the surrounding layout. Nothing renders when there is no value at all.
export function SignedImg({ src, alt, className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const { src: resolved, loading } = useSignedImageUrl(src)

  if (!src) return null

  if (loading || !resolved) {
    return (
      <div
        className={className}
        role="img"
        aria-label={alt || 'Image'}
        data-testid="signed-img-loading"
      />
    )
  }

  return <img src={resolved} alt={alt} className={className} {...props} />
}