// Pointer-vs-keyboard tracking lives outside React on purpose: the route error
// boundary keys the whole channel subtree on the pathname (App.tsx), so the
// composer is destroyed and recreated on every room switch. A listener inside
// the composer can never see the click that caused the navigation.
let installed = false
let lastWasPointer = false
let lastPointerWasTouch = false

function handlePointerDown(event: Event) {
  lastWasPointer = true
  lastPointerWasTouch = (event as PointerEvent).pointerType === 'touch'
}

function handleKeyDown() {
  lastWasPointer = false
  lastPointerWasTouch = false
}

// Idempotent. Called from main.tsx so the click that opens a lazy channel
// chunk is recorded before the composer that needs it exists.
export function trackInputModality() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleKeyDown, true)
}

// True only for a non-touch pointer (mouse, pen, or an event without a
// pointerType, which is what jsdom produces). Cold loads, back/forward and
// keyboard navigation must not move focus, so nothing else counts.
export function lastInputWasMouse() {
  return lastWasPointer && !lastPointerWasTouch
}

// Test-only: the tracker is a module singleton that outlives components.
export function resetInputModality() {
  lastWasPointer = false
  lastPointerWasTouch = false
}
