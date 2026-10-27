import { describe, it, expect, beforeEach } from 'vitest'
import { lastInputWasMouse, resetInputModality, trackInputModality } from './inputModality'

// jsdom has no PointerEvent constructor in every version, so build a plain
// event and stamp the property the browser would provide.
function pointerDown(pointerType?: string) {
  const event = new Event('pointerdown', { bubbles: true })
  if (pointerType) Object.defineProperty(event, 'pointerType', { value: pointerType })
  document.dispatchEvent(event)
}

function keyDown() {
  document.dispatchEvent(new Event('keydown', { bubbles: true }))
}

describe('inputModality', () => {
  beforeEach(() => {
    trackInputModality()
    resetInputModality()
  })

  it('treats a mouse pointer as focusable', () => {
    pointerDown('mouse')
    expect(lastInputWasMouse()).toBe(true)
  })

  it('treats a touch pointer as not focusable, so the keyboard stays closed', () => {
    pointerDown('touch')
    expect(lastInputWasMouse()).toBe(false)
  })

  it('treats a pointer event without a type as a mouse, which is what jsdom sends', () => {
    pointerDown()
    expect(lastInputWasMouse()).toBe(true)
  })

  it('treats keyboard input as not focusable, so arrow-key room navigation keeps focus', () => {
    pointerDown('mouse')
    keyDown()
    expect(lastInputWasMouse()).toBe(false)
  })

  it('is safe to install twice and starts with nothing recorded', () => {
    trackInputModality()
    trackInputModality()
    expect(lastInputWasMouse()).toBe(false)

    pointerDown('mouse')
    expect(lastInputWasMouse()).toBe(true)
  })
})
