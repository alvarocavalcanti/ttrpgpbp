import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Reads a key from app_settings, falling back to `fallback` when absent.
// Returns a refresh function so callers can re-fetch after an update.
export function useAppSetting<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      if (error) throw error
      setValue((data?.value as T) ?? fallback)
    } catch (err) {
      console.error(`Error fetching app setting ${key}:`, err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [key, fallback])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { value, loading, error, refresh }
}
