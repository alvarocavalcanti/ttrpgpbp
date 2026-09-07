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
//
// Pass `enabled=false` for always-mounted consumers whose surface is closed
// (e.g. a popup menu inside a persistent panel): a disabled handler is not
// pushed at all, so it can't sit on top of the stack and swallow Escape
// meant for a modal or drawer below.
export function useEscapeToClose(onClose: () => void, enabled = true) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!enabled) return
    installDispatcher()
    const handler = () => {
      onCloseRef.current()
    }
    escapeStack.push(handler)
    return () => {
      const i = escapeStack.indexOf(handler)
      if (i !== -1) escapeStack.splice(i, 1)
    }
  }, [enabled])
}
