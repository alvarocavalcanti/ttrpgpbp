import { useRef, useState } from 'react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSignedImageUrl } from '../hooks/useSignedImageUrl'

// Zoom levels: 1 = fit-to-viewport (images are never upscaled past fit),
// 8 = 800%. The +/- buttons step zoom by a factor of ZOOM_STEP.
const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.25
const DOUBLE_TAP_MS = 300

const BTN =
  'flex h-11 w-11 items-center justify-center rounded text-xl text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'

interface ImageViewerModalProps {
  /** Raw stored value (bucket path or URL); resolved via useSignedImageUrl's cache. */
  src: string | null | undefined
  alt: string
  onClose: () => void
}

// Fullscreen image viewer for channel message images (issue #458). Fits the
// image to the viewport on load, +/- zoom controls, native-scroll panning
// when zoomed, pinch to zoom on touch devices, double-tap/double-click
// resets to fit. Escape and the X button close.
export function ImageViewerModal({ src, alt, onClose }: ImageViewerModalProps) {
  const { src: resolved, loading } = useSignedImageUrl(src)
  const dialogRef = useRef<HTMLDivElement>(null)
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const lastTap = useRef(0)
  const [zoom, setZoom] = useState(ZOOM_MIN)
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null)

  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)

  const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
  const resetZoom = () => setZoom(ZOOM_MIN)

  // Fit once the image has real dimensions: displayed size = natural size x
  // fitScale, and zoom multiplies from there. Uses the viewport (the scroll
  // container fills it) so the math is testable without layout.
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    if (!w || !h) return
    const scale = Math.min(1, window.innerWidth / w, window.innerHeight / h)
    setFit({ w: w * scale, h: h * scale })
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      pinch.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom,
      }
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pinch.current || e.touches.length !== 2) return
    const [a, b] = [e.touches[0], e.touches[1]]
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (pinch.current.dist > 0) {
      setZoom(clamp(pinch.current.zoom * (dist / pinch.current.dist)))
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (pinch.current && e.touches.length < 2) {
      pinch.current = null
      return
    }
    // Single-finger tap inside the double-tap window resets to fit.
    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) resetZoom()
      lastTap.current = now
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 bg-black/90"
    >
      <div className="absolute right-0 top-0 z-10 flex items-center gap-1 p-2">
        <button
          type="button"
          aria-label="Zoom out"
          className={BTN}
          onClick={() => setZoom((z) => clamp(z / ZOOM_STEP))}
        >
          −
        </button>
        <span aria-live="polite" className="w-14 text-center text-sm text-white">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          className={BTN}
          onClick={() => setZoom((z) => clamp(z * ZOOM_STEP))}
        >
          +
        </button>
        <button type="button" aria-label="Close" className={BTN} onClick={onClose}>
          ✕
        </button>
      </div>
      <div
        className="h-full w-full overflow-auto"
        style={{ touchAction: 'pan-x pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={resetZoom}
      >
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
              role="status"
              aria-label="Loading image"
            />
          </div>
        )}
        {resolved && !loading && (
          <img
            src={resolved}
            alt={alt}
            onLoad={handleLoad}
            draggable={false}
            className="mx-auto block select-none"
            // Auto margins center without clipping when zoomed past the
            // viewport (flex centering in a scroll container clips the top).
            style={
              fit
                ? { width: fit.w * zoom, height: fit.h * zoom }
                : { maxWidth: '100%', maxHeight: '100%' }
            }
          />
        )}
      </div>
    </div>
  )
}
