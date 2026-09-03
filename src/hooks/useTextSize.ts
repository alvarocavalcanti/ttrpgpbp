import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'rolebypost-text-size'

export type TextSize = 'normal' | 'large' | 'xlarge'

const SIZES: TextSize[] = ['normal', 'large', 'xlarge']

function getInitialTextSize(): TextSize {
  if (typeof window === 'undefined') return 'normal'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return (SIZES as string[]).includes(saved ?? '') ? (saved as TextSize) : 'normal'
}

// Scales the whole app's base font size (see index.css: html[data-text-size]).
// Persisted per-device, like the theme. Applies `data-text-size` on <html>;
// the default (normal) needs no attribute, so first paint is unaffected.
export function useTextSize() {
  const [textSize, setTextSize] = useState<TextSize>(getInitialTextSize)

  useEffect(() => {
    const root = document.documentElement
    if (textSize === 'normal') {
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