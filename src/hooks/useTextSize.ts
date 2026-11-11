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

function normalize(percent: number): number {
  if (!Number.isFinite(percent)) return TEXT_SIZE_DEFAULT
  const clamped = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, percent))
  return Math.round(clamped / TEXT_SIZE_STEP) * TEXT_SIZE_STEP
}

function readStored(): number {
  const saved = safeGetItem(TEXT_SIZE_STORAGE_KEY)
  if (saved === null) return TEXT_SIZE_DEFAULT
  const parsed = Number(saved)
  return Number.isFinite(parsed) ? normalize(parsed) : TEXT_SIZE_DEFAULT
}

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

export function setTextSize(next: number) {
  const percent = normalize(next)
  currentPercent = percent
  apply(percent)
  safeSetItem(TEXT_SIZE_STORAGE_KEY, String(percent))
  listeners.forEach(l => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): number {
  return currentPercent
}

// Prerendered public pages hydrate against the default, then switch to the
// saved size on the client, so hydration never mismatches.
const getServerSnapshot = (): number => TEXT_SIZE_DEFAULT

export function useTextSize() {
  const percent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { percent, setPercent: setTextSize }
}
