// Pre-paint auth hint for the `/` landing/lobby split (issue #658).
//
// The marketing landing is prerendered into `dist/index.html` and painted by
// the browser before any JS runs, so a signed-in visitor reloading `/` would
// see it flash before the lobby. This module detects a persisted Supabase
// session synchronously; the inline script in `index.html` uses the same key
// pattern to hide `#root` before first paint, and `main.tsx` drops the
// prerendered DOM before mounting. Keep `AUTH_STORAGE_KEY_PATTERN` and the
// inline regex in sync — `authSessionHint.test.ts` guards the drift.

// Supabase-js persists the session under `sb-<project-ref>-auth-token`
// (chunked over 2 KB as `.0`, `.1`, …). PKCE verifier keys end in
// `-code-verifier` and must not count as a session.
export const AUTH_STORAGE_KEY_PATTERN = /^sb-.*-auth-token(\.\d+)?$/

export function isAuthStorageKey(key: string): boolean {
  return AUTH_STORAGE_KEY_PATTERN.test(key)
}

export function hasPersistedSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const storage = window.localStorage
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && isAuthStorageKey(key)) return true
    }
  } catch {
    // Storage access can throw (e.g. blocked/private mode); treat as signed out.
  }
  return false
}
