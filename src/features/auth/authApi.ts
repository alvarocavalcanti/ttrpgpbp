import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

// Data layer for the auth feature (ARCH-1): every Supabase call AuthContext
// and ProfileSettings make lives here; components and context providers keep
// only state and UX. Plain async functions — no state to own.

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export function subscribeToAuthEvents(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })
}

export async function authSignOut() {
  await supabase.auth.signOut()
}

export async function fetchProfileRow(userId: string) {
  return supabase
    .from('profiles')
    .select('id, display_name, avatar_url, created_at, is_suspended')
    .eq('id', userId)
    .single()
}

export async function updateDisplayName(userId: string, displayName: string) {
  return supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
}

export async function deleteAccount() {
  return supabase.functions.invoke('delete-account', { method: 'POST' })
}
