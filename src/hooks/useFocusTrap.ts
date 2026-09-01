import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

// Traps Tab/Shift+Tab within the dialog container and restores focus to the
// trigger element on unmount — the focus half of the ARIA dialog contract
// (UX audit #345). Pair with useEscapeToClose, which covers the Escape half.
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('hidden') && el.closest('[aria-hidden="true"]') === null
      )

    // Move focus into the dialog unless the surface already did (e.g. a
    // search modal that focuses its input on mount).
    if (!container.contains(document.activeElement)) {
      const first = focusables()[0]
      if (first) {
        first.focus()
      } else {
        container.tabIndex = -1
        container.focus()
      }
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = active instanceof HTMLElement && container.contains(active)
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      previouslyFocused?.focus()
    }
  }, [containerRef])
}
