import { useState } from 'react'
import type { ReactNode } from 'react'

// Hidden-until-tapped inline spoiler (issue #709). A <button> would be
// invalid here — spoiler content can hold links/images — so this is a span
// with role="button", focusable and operable by keyboard. While hidden the
// text is transparent, unselectable, and aria-hidden; the wrapper's
// aria-label is the announced affordance. Reveal is one-way (Discord-style).
// Activation never propagates: search results nest this inside a clickable
// row, and revealing must not also navigate.
export function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)

  if (revealed) {
    return <span className="rounded px-0.5 bg-yellow-50 dark:bg-yellow-950/40">{children}</span>
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler — press to reveal"
      onClick={(e) => {
        e.stopPropagation()
        setRevealed(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          setRevealed(true)
        }
      }}
      className="cursor-pointer rounded px-1 select-none bg-surface-600 dark:bg-surface-500 text-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
    >
      <span aria-hidden="true">{children}</span>
    </span>
  )
}
