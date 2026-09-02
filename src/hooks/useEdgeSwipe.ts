import { useEffect } from 'react'

interface EdgeSwipeOptions {
  /** Called when a leftward swipe from the right edge crosses the threshold. */
  onOpen: () => void
  /** Called when a rightward swipe crosses the threshold (anywhere on screen). */
  onClose: () => void
  /** While true, rightward swipes trigger onClose. */
  open: boolean
  /** Right-edge detection zone width in px. Inset avoids the iOS/Android browser back-gesture zone. */
  edgeWidth?: number
  /** Horizontal travel required to trigger, in px. */
  threshold?: number
}

// Touch-only: mouse users get the menu button; touch users get the edge pull.
// Threshold snap (not finger-follow) keeps drawers conditionally mounted,
// which avoids transform containing-block traps for modals inside drawers.
export function useEdgeSwipe({ onOpen, onClose, open, edgeWidth = 24, threshold = 60 }: EdgeSwipeOptions) {
  useEffect(() => {
    let startX = 0
    let startY = 0
    let fromEdge = false

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      startX = touch.clientX
      startY = touch.clientY
      fromEdge = startX >= window.innerWidth - edgeWidth
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      // Vertical scroll wins: any dominant vertical movement cancels the gesture.
      if (Math.abs(dy) > Math.abs(dx)) return
      if (fromEdge && dx < -threshold) onOpen()
      else if (open && dx > threshold) onClose()
      fromEdge = false
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onOpen, onClose, open, edgeWidth, threshold])
}
