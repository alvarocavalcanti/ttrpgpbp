import { useSyncExternalStore, useCallback } from 'react'

const STORAGE_KEY = 'rolebypost-theme'

type Theme = 'light' | 'dark'

const LIGHT_THEME_COLOR = '#f9fafb'
const DARK_THEME_COLOR = '#111827'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  // Guard for import-time reads (module init runs before test setup stubs
  // matchMedia); browsers always have it.
  if (typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Single source of truth (module-level store) so every useTheme() consumer —
// the header ThemeToggle and the menu drawer's dark-mode row — stays in sync.
// Without this, two useTheme() instances each hold their own useState and can
// drift (e.g. toggle via the drawer on mobile, rotate to md+ → stale header
// icon, first tap is a no-op).
let currentTheme: Theme = getInitialTheme()
const listeners = new Set<() => void>()

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  window.localStorage.setItem(STORAGE_KEY, theme)
  // Keep the browser/PWA chrome (address bar, standalone app shell) in sync
  // with the active theme so it never flashes a light header over dark UI.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

function setTheme(next: Theme) {
  currentTheme = next
  applyTheme(next)
  listeners.forEach(l => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): Theme {
  return currentTheme
}

// Apply the persisted/initial theme to <html> once at module load (previously
// done by each useTheme instance's effect).
applyTheme(currentTheme)

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme])
  return { theme, isDark: theme === 'dark', toggleTheme }
}