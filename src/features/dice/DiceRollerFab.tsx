import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DiceRoller } from './DiceRoller'

// Floating dice-roller control (#629). Defaults to the bottom-right of the
// message area and can be dragged anywhere inside it; the position is
// remembered per device. Dragging is separated from the open/close tap by a
// small movement threshold, and only the trigger starts a drag so interacting
// with the open panel never moves it.

const MARGIN = 12
const DRAG_THRESHOLD = 6
const STORAGE_KEY = 'dice-roller-fab-position'

export interface FabPoint {
  x: number
  y: number
}

export function defaultFabPosition(areaW: number, areaH: number, fabW: number, fabH: number, margin = MARGIN): FabPoint {
  return { x: Math.max(margin, areaW - fabW - margin), y: Math.max(margin, areaH - fabH - margin) }
}

export function clampFabPosition(x: number, y: number, areaW: number, areaH: number, fabW: number, fabH: number, margin = MARGIN): FabPoint {
  const maxX = Math.max(margin, areaW - fabW - margin)
  const maxY = Math.max(margin, areaH - fabH - margin)
  return { x: Math.min(Math.max(margin, x), maxX), y: Math.min(Math.max(margin, y), maxY) }
}

function loadStoredPosition(): FabPoint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FabPoint>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

interface Layout {
  x: number
  y: number
  areaW: number
  areaH: number
}

interface DiceRollerFabProps {
  channelId: string
  popup?: boolean
  onRoll: (notation: string) => void
  onOpenHistory: () => void
}

export function DiceRollerFab({ channelId, popup, onRoll, onOpenHistory }: DiceRollerFabProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const drag = useRef<{ id: number; startX: number; startY: number; ox: number; oy: number; moved: boolean; el: HTMLElement } | null>(null)
  const movedRef = useRef(false)

  const measure = useCallback(() => {
    const el = wrapperRef.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return null
    return { fabW: el.offsetWidth, fabH: el.offsetHeight, areaW: parent.clientWidth, areaH: parent.clientHeight }
  }, [])

  const place = useCallback((point: FabPoint, dims: { fabW: number; fabH: number; areaW: number; areaH: number }) => {
    const clamped = clampFabPosition(point.x, point.y, dims.areaW, dims.areaH, dims.fabW, dims.fabH)
    setLayout({ ...clamped, areaW: dims.areaW, areaH: dims.areaH })
  }, [])

  useLayoutEffect(() => {
    const dims = measure()
    if (dims) {
      const stored = loadStoredPosition()
      place(stored ?? defaultFabPosition(dims.areaW, dims.areaH, dims.fabW, dims.fabH), dims)
    }
    // The message area shrinks/grows (e.g. a reply bar or a wrapped composer),
    // so reclamp on its resize too, not just the window's.
    const reclamp = () => {
      const next = measure()
      if (!next) return
      setLayout((current) => {
        if (!current) return current
        const clamped = clampFabPosition(current.x, current.y, next.areaW, next.areaH, next.fabW, next.fabH)
        return { ...clamped, areaW: next.areaW, areaH: next.areaH }
      })
    }
    window.addEventListener('resize', reclamp)
    const parent = wrapperRef.current?.offsetParent as HTMLElement | null
    let observer: ResizeObserver | undefined
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(reclamp)
      observer.observe(parent)
    }
    return () => {
      window.removeEventListener('resize', reclamp)
      observer?.disconnect()
    }
  }, [measure, place])

  const onPointerDown = (e: ReactPointerEvent) => {
    // Only the round trigger drags; the open panel's controls must not.
    const fab = (e.target as HTMLElement).closest('[data-dice-fab]') as HTMLElement | null
    if (!fab || !layout) return
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, ox: layout.x, oy: layout.y, moved: false, el: fab }
    movedRef.current = false
    // Capture on the trigger, not the wrapper: capturing on an ancestor makes
    // the browser dispatch `click` to that ancestor, so the trigger's own
    // onClick (open the roller) would never fire after a tap.
    try { fab.setPointerCapture(e.pointerId) } catch { /* pointer capture unsupported */ }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const state = drag.current
    if (!state || e.pointerId !== state.id) return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) state.moved = true
    if (!state.moved) return
    const dims = measure()
    if (dims) place({ x: state.ox + dx, y: state.oy + dy }, dims)
  }

  const endDrag = (e: ReactPointerEvent) => {
    const state = drag.current
    if (!state || e.pointerId !== state.id) return
    movedRef.current = state.moved
    drag.current = null
    try { state.el.releasePointerCapture(e.pointerId) } catch { /* pointer capture unsupported */ }
    if (state.moved && layout) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: layout.x, y: layout.y })) } catch { /* storage unavailable */ }
    }
  }

  const align = layout ? (layout.x > layout.areaW / 2 ? 'right' : 'left') : 'right'
  // Open toward whichever side has more room, so a FAB dragged near the top
  // doesn't clip its panel against the channel's top edge.
  const panelBelow = layout ? layout.y < layout.areaH - layout.y : false

  return (
    <div
      ref={wrapperRef}
      data-testid="dice-roller-fab"
      className={`absolute z-20 ${layout ? '' : 'bottom-3 right-3'}`}
      style={layout ? { left: layout.x, top: layout.y, touchAction: 'none' } : { touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        if (movedRef.current) {
          e.stopPropagation()
          e.preventDefault()
          movedRef.current = false
        }
      }}
    >
      <DiceRoller fab align={align} panelBelow={panelBelow} popup={popup} channelId={channelId} onRoll={onRoll} onOpenHistory={onOpenHistory} />
    </div>
  )
}
