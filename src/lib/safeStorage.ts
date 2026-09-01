// localStorage throws (SecurityError/QuotaExceededError) in Safari private
// mode or when storage is blocked; every call site routes through these
// no-throw wrappers so a blocked store degrades to a no-op.
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable — draft persistence is best-effort
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // storage unavailable — draft persistence is best-effort
  }
}
