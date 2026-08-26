import { useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { useSignedImageUrl } from '../hooks/useSignedImageUrl';

interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackIconClassName?: string;
}

export function Avatar({ src, alt, className, fallbackIconClassName, ...props }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const { src: resolvedSrc } = useSignedImageUrl(src);

  if (!src || hasError || !resolvedSrc) {
    return (
      <div className={`flex items-center justify-center bg-zinc-800 text-zinc-400 ${className}`} aria-label={alt || "Avatar placeholder"}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={fallbackIconClassName || "w-1/2 h-1/2"}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}
