import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { RefCallback } from 'react'

// Reports whether a line-clamped element's content is taller than the clamp.
//
// The obvious `el.scrollHeight > el.clientHeight` check is not enough here:
//  - it runs once, and misses content that arrives later (the shared Markdown
//    component is lazy-loaded, so the first paint is a Suspense skeleton —
//    issue #577), and
//  - WebKit can report a `-webkit-box` clamp's scrollHeight equal to its
//    clientHeight, so the comparison itself is unreliable there.
//
// So this hook (a) re-measures whenever the box resizes or its content is
// replaced, and (b) reads the natural height by briefly dropping the clamp
// inline — restored in the same task, before the browser paints, so nothing
// flickers. Browsers and the test suite that report honest heights are
// unaffected: the measurement result is the same.
export function useElementOverflow<T extends HTMLElement>(): {
  ref: RefCallback<T>
  overflows: boolean
} {
  const [node, setNode] = useState<T | null>(null)
  const [overflows, setOverflows] = useState(false)

  const ref = useCallback<RefCallback<T>>((next) => setNode(next), [])

  const measure = useCallback((el: T | null) => {
    if (!el) return
    const clamped = el.clientHeight
    // ponytail: read the full height by dropping the clamp inline. The clamp
    // always comes from the Tailwind class on this element, never an inline
    // style, so removing the property is a clean restore. Switch to the
    // clone-based measurement if an inline line-clamp is ever introduced.
    el.style.setProperty('-webkit-line-clamp', 'unset')
    const full = el.scrollHeight
    el.style.removeProperty('-webkit-line-clamp')
    setOverflows(full > clamped + 1)
  }, [])

  // Measure before paint so the initial render never flashes the wrong state.
  useLayoutEffect(() => {
    measure(node)
  }, [node, measure])

  useEffect(() => {
    if (!node) return
    // Content replaced (lazy Markdown resolving, status text changing) and box
    // resized (window, sidebar, expand/collapse) both need a fresh measure.
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    const mutations = new MutationObserver(() => measure(node))
    mutations.observe(node, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [node, measure])

  return { ref, overflows }
}
