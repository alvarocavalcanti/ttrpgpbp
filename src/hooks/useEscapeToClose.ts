import { useEffect } from 'react'

// Closes a modal when Escape is pressed. Most modals use aria-modal without
// consistent Escape handling (UX#18); this gives them one shared behavior.
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}
