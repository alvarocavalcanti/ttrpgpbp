import { useEffect, useRef } from 'react'

// Stack of active Escape handlers; only the topmost (most recently mounted)
// modal responds to Escape. Without this, nested modals (e.g. a ConfirmDialog
// inside ChannelSettings) would close the parent too, losing unsaved state.
type EscapeHandler = (e: KeyboardEvent) => void
const escapeStack: EscapeHandler[] = []

// One lazy global dispatcher; consumers are passive stack entries.
let dispatcherInstalled = false
function installDispatcher() {
  if (dispatcherInstalled) return
  dispatcherInstalled = true
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') escapeStack[escapeStack.length - 1]?.(e)
  })
}

// Closes a modal when Escape is pressed. Most modals use aria-modal without
// consistent Escape handling (UX#18); this gives them one shared behavior,
// stacking so the innermost open modal handles Escape first.
//
// The handler object is pushed once per mount and reads the latest onClose
// through a ref — callers commonly pass inline arrows whose identity changes
// every render, and re-pushing would reorder the stack so a re-rendered
// parent could jump back on top and swallow Escape meant for its child.
export function useEscapeToClose(onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    installDispatcher()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current(e)
    }
    escapeStack.push(handler)
    return () => {
      const i = escapeStack.indexOf(handler)
      if (i !== -1) escapeStack.splice(i, 1)
    }
  }, [])
}
