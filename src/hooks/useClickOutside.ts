import { useEffect, useRef } from 'react'

// Invokes the handler when a pointer/click lands outside the referenced
// element. Used to dismiss menus and popovers.
export function useClickOutside<T extends HTMLElement>(onClickOutside: () => void, active = true) {
  const ref = useRef<T>(null)
  const handlerRef = useRef(onClickOutside)
  handlerRef.current = onClickOutside

  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handlerRef.current()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [active])

  return ref
}
