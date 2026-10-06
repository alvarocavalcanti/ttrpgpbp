import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DiceRollerFab, clampFabPosition, defaultFabPosition, anchorFromPoint, pointFromAnchor } from './DiceRollerFab'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }
}))

vi.mock('./useDiceFavorites', () => ({
  useDiceFavorites: () => ({
    favorites: [], isFavorite: () => false, canFavorite: true, toggleFavorite: vi.fn()
  })
}))

describe('dice roller fab position', () => {
  it('defaults to the bottom-right with a margin', () => {
    expect(defaultFabPosition(400, 300, 56, 56, 12)).toEqual({ x: 332, y: 232 })
  })

  it('clamps a dragged position inside the area', () => {
    expect(clampFabPosition(-50, -50, 400, 300, 56, 56, 12)).toEqual({ x: 12, y: 12 })
    expect(clampFabPosition(999, 999, 400, 300, 56, 56, 12)).toEqual({ x: 332, y: 232 })
  })

  it('keeps the margin when the area is smaller than the fab', () => {
    expect(clampFabPosition(50, 50, 40, 40, 56, 56, 12)).toEqual({ x: 12, y: 12 })
  })

  it('describes the bottom-right spot as a corner anchor', () => {
    expect(anchorFromPoint({ x: 332, y: 232 }, 400, 300, 56, 56, 12)).toEqual({ right: 12, bottom: 12 })
  })

  it('turns a corner anchor back into a position', () => {
    expect(pointFromAnchor({ right: 12, bottom: 12 }, 400, 300, 56, 56, 12)).toEqual({ x: 332, y: 232 })
  })

  it('re-derives the same spot after the area shrinks and grows back (no drift)', () => {
    const anchor = anchorFromPoint({ x: 332, y: 232 }, 400, 300, 56, 56)
    expect(anchor).toEqual({ right: 12, bottom: 12 })
    // Composer grows: the area loses 100px and the fab rides up with the edge.
    expect(pointFromAnchor(anchor, 400, 200, 56, 56)).toEqual({ x: 332, y: 132 })
    // Composer closes: the same anchor puts it right back.
    expect(pointFromAnchor(anchor, 400, 300, 56, 56)).toEqual({ x: 332, y: 232 })
  })

  it('keeps a dragged spot relative to the bottom-right corner', () => {
    const anchor = anchorFromPoint({ x: 100, y: 180 }, 400, 300, 56, 56)
    expect(anchor).toEqual({ right: 244, bottom: 64 })
    expect(pointFromAnchor(anchor, 400, 200, 56, 56)).toEqual({ x: 100, y: 80 })
    expect(pointFromAnchor(anchor, 400, 300, 56, 56)).toEqual({ x: 100, y: 180 })
  })

  it('clamps a corner anchor when the area is smaller than the fab', () => {
    expect(pointFromAnchor({ right: 12, bottom: 12 }, 40, 40, 56, 56, 12)).toEqual({ x: 12, y: 12 })
  })
})

describe('DiceRollerFab resize anchoring (#677)', () => {
  const FAB_SIZE = 56
  const AREA_W = 400
  let areaH = 300

  // jsdom reports zero/null for layout metrics; stub the properties the FAB
  // measures so a real ResizeObserver cycle can be driven.
  beforeEach(() => {
    areaH = 300
    localStorage.clear()
    // jsdom lacks PointerEvent; alias it to MouseEvent so pointer events carry
    // clientX/clientY for the drag flow.
    if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
      ;(window as unknown as { PointerEvent: unknown }).PointerEvent = window.MouseEvent
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => FAB_SIZE })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => FAB_SIZE })
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('data-testid') === 'dice-roller-fab' ? document.body : null
      },
    })
    Object.defineProperty(document.body, 'clientWidth', { configurable: true, get: () => AREA_W })
    Object.defineProperty(document.body, 'clientHeight', { configurable: true, get: () => areaH })
  })

  afterEach(() => {
    // Restore jsdom's defaults so the stubs don't leak into the other suites.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 0 })
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => null })
    delete (document.body as unknown as Record<string, unknown>).clientWidth
    delete (document.body as unknown as Record<string, unknown>).clientHeight
  })

  it('returns the fab to its bottom-right spot after the area shrinks and grows', () => {
    render(<DiceRollerFab channelId="c1" onRoll={vi.fn()} onOpenHistory={vi.fn()} />)
    const fab = screen.getByTestId('dice-roller-fab')
    expect(fab.style.top).toBe('232px')
    expect(fab.style.left).toBe('332px')

    // The composer grows, shrinking the message area under the fab.
    areaH = 200
    act(() => {
      ;(globalThis as any).__resizeObservers.at(-1).trigger()
    })
    expect(fab.style.top).toBe('132px')

    // The message posts and the composer collapses: the fab must come back.
    areaH = 300
    act(() => {
      ;(globalThis as any).__resizeObservers.at(-1).trigger()
    })
    expect(fab.style.top).toBe('232px')
  })

  it('reads a saved corner anchor on mount', () => {
    localStorage.setItem('dice-roller-fab-position', JSON.stringify({ right: 100, bottom: 100 }))
    render(<DiceRollerFab channelId="c1" onRoll={vi.fn()} onOpenHistory={vi.fn()} />)
    const fab = screen.getByTestId('dice-roller-fab')
    expect(fab.style.left).toBe('244px')
    expect(fab.style.top).toBe('144px')
  })

  it('still reads a legacy absolute position on mount', () => {
    localStorage.setItem('dice-roller-fab-position', JSON.stringify({ x: 100, y: 100 }))
    render(<DiceRollerFab channelId="c1" onRoll={vi.fn()} onOpenHistory={vi.fn()} />)
    const fab = screen.getByTestId('dice-roller-fab')
    expect(fab.style.left).toBe('100px')
    expect(fab.style.top).toBe('100px')
  })

  it('re-anchors on release after a resize mid-drag and persists the anchor', () => {
    render(<DiceRollerFab channelId="c1" onRoll={vi.fn()} onOpenHistory={vi.fn()} />)
    const fab = screen.getByTestId('dice-roller-fab')
    const trigger = screen.getByRole('button', { name: 'Open dice roller' })

    // Drag up 40px: y 232 -> 192.
    fireEvent.pointerDown(trigger, { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(trigger, { pointerId: 1, clientX: 100, clientY: 260 })
    expect(fab.style.top).toBe('192px')

    // The composer grows mid-drag; the resize handler bails while dragging.
    areaH = 200
    act(() => {
      ;(globalThis as any).__resizeObservers.at(-1).trigger()
    })
    expect(fab.style.top).toBe('192px')

    // Release re-measures and pulls the fab back inside the shrunken area.
    fireEvent.pointerUp(trigger, { pointerId: 1, clientX: 100, clientY: 260 })
    expect(fab.style.top).toBe('92px')

    // The corner anchor, not the stale absolute pixel, was saved.
    expect(JSON.parse(localStorage.getItem('dice-roller-fab-position')!)).toEqual({ right: 12, bottom: 52 })
  })
})

describe('DiceRollerFab', () => {
  it('renders the floating trigger and opens the roller', () => {
    render(<DiceRollerFab channelId="c1" onRoll={vi.fn()} onOpenHistory={vi.fn()} />)
    expect(screen.queryByText('Dice Roller')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open dice roller' }))

    expect(screen.getByText('Dice Roller')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
  })
})
