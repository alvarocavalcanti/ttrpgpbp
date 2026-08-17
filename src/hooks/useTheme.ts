import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'rolebypost-theme'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const LIGHT_THEME_COLOR = '#f9fafb'
const DARK_THEME_COLOR = '#111827'

// Applies a `dark` class to <html>, which Tailwind's darkMode: 'class'
// variants key off. Persists the choice; defaults to the OS preference.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    window.localStorage.setItem(STORAGE_KEY, theme)
    // Keep the browser/PWA chrome (address bar, standalone app shell) in sync
    // with the active theme so it never flashes a light header over dark UI.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, isDark: theme === 'dark', toggleTheme }
}
