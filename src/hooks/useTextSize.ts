import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'rolebypost-text-size'

export type TextSize = 'normal' | 'large' | 'xlarge'

export const TEXT_SIZE_NORMAL: TextSize = 'normal'
export const TEXT_SIZE_LARGE: TextSize = 'large'
export const TEXT_SIZE_XLARGE: TextSize = 'xlarge'

const SIZES: TextSize[] = [TEXT_SIZE_NORMAL, TEXT_SIZE_LARGE, TEXT_SIZE_XLARGE]

function readStoredTextSize(): TextSize {
  if (typeof window === 'undefined') return TEXT_SIZE_NORMAL
  let saved: string | null = null
  try {
    // Web Storage can throw (private mode, storage disabled) — fall back to
    // normal rather than letting app startup crash.
    saved = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return TEXT_SIZE_NORMAL
  }
  return (SIZES as string[]).includes(saved ?? '') ? (saved as TextSize) : TEXT_SIZE_NORMAL
}

// Applies the persisted text size to <html> synchronously, before first paint.
// Called once at app entry (main.tsx) so a fresh page load restores the size
// regardless of route — useTextSize alone only runs inside /settings.
export function applyStoredTextSize(): void {
  if (typeof window === 'undefined') return
  const root = document.documentElement
  const size = readStoredTextSize()
  if (size === TEXT_SIZE_NORMAL) {
    root.removeAttribute('data-text-size')
  } else {
    root.setAttribute('data-text-size', size)
  }
}

// Scales the whole app's base font size (see index.css: html[data-text-size]).
// Persisted per-device, like the theme. Applies `data-text-size` on <html>;
// the default (normal) needs no attribute, so first paint is unaffected.
export function useTextSize() {
  const [textSize, setTextSize] = useState<TextSize>(readStoredTextSize)

  useEffect(() => {
    const root = document.documentElement
    if (textSize === TEXT_SIZE_NORMAL) {
      root.removeAttribute('data-text-size')
    } else {
      root.setAttribute('data-text-size', textSize)
    }
    window.localStorage.setItem(STORAGE_KEY, textSize)
  }, [textSize])

  const setSize = useCallback((size: TextSize) => {
    setTextSize(size)
  }, [])

  return { textSize, setSize }
}