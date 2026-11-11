import { useSyncExternalStore } from 'react'
import { safeGetItem, safeSetItem } from '../lib/safeStorage'

// Per-device reading preference, like the theme: the stored percentage is
// written to `--text-scale` on <html>, and index.css multiplies the 17px base
// by it so every rem-based Tailwind size follows.
export const TEXT_SIZE_STORAGE_KEY = 'rolebypost-text-size'
export const TEXT_SIZE_MIN = 75
export const TEXT_SIZE_MAX = 150
export const TEXT_SIZE_STEP = 25
export const TEXT_SIZE_DEFAULT = 100
export const TEXT_SCALE_VAR = '--text-scale'

/** Clamps a percentage to the allowed range and snaps it to the nearest step. */
function normalize(percent: number): number {
  if (!Number.isFinite(percent)) return TEXT_SIZE_DEFAULT
  const clamped = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, percent))
  return Math.round(clamped / TEXT_SIZE_STEP) * TEXT_SIZE_STEP
}

/** Reads the saved percentage, falling back to 100 for absent or invalid values. */
function readStored(): number {
  const saved = safeGetItem(TEXT_SIZE_STORAGE_KEY)
  if (saved === null) return TEXT_SIZE_DEFAULT
  const parsed = Number(saved)
  return Number.isFinite(parsed) ? normalize(parsed) : TEXT_SIZE_DEFAULT
}

/** Writes the percentage to the `--text-scale` custom property on <html>. */
function apply(percent: number) {
  document.documentElement.style.setProperty(TEXT_SCALE_VAR, String(percent / 100))
}

// Single source of truth (module-level store) so the menu row and the sheet
// can never disagree. Applied at module load, like useTheme, so the saved size
// is in place before the first React commit; index.html repeats the read
// before first paint so a reload never flashes at 100%.
let currentPercent = readStored()
apply(currentPercent)
const listeners = new Set<() => void>()

/** Applies, persists and broadcasts a new text size (clamped and snapped). */
export function setTextSize(next: number) {
  const percent = normalize(next)
  currentPercent = percent
  apply(percent)
  safeSetItem(TEXT_SIZE_STORAGE_KEY, String(percent))
  listeners.forEach(l => l())
}

/** Registers a store listener; returns the unsubscribe function. */
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Current text size for the store snapshot. */
function getSnapshot(): number {
  return currentPercent
}

// Prerendered public pages hydrate against the default, then switch to the
// saved size on the client, so hydration never mismatches.
const getServerSnapshot = (): number => TEXT_SIZE_DEFAULT

/** Reads and updates the app-wide text size preference (75%–150%). */
export function useTextSize() {
  const percent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { percent, setPercent: setTextSize }
}
