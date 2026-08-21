import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { env } from '../env'

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  // @ts-expect-error - Expose for E2E tests
  window.__supabase = supabase
}
