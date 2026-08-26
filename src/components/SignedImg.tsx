import type { ImgHTMLAttributes } from 'react'
import { useSignedImageUrl } from '../hooks/useSignedImageUrl'

// <img> that resolves a stored value (external URL or private-bucket object
// path) to a displayable src before rendering. Bucket paths are signed; while
// a signed URL is pending, nothing renders rather than a broken href.
export function SignedImg({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useSignedImageUrl(src)
  if (!resolved) return null
  return <img src={resolved} alt={alt} {...props} />
}