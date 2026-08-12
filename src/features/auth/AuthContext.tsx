import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  error: Error | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const lastFetchedUserId = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchProfile(userId: string) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (mounted) setProfile(data)
      } catch (err) {
        // Preserve any previously-loaded profile so a transient fetch failure
        // doesn't wipe the UI (UX#16); a later auth event retries it.
        console.error('Error fetching profile:', err)
        if (mounted) setError(err as Error)
      }
    }

    async function getInitialSession() {
      setError(null)
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (!mounted) return

        setSession(currentSession)
        setUser(currentSession?.user ?? null)

        if (currentSession?.user && lastFetchedUserId.current !== currentSession.user.id) {
          lastFetchedUserId.current = currentSession.user.id
          await fetchProfile(currentSession.user.id)
        }
      } catch (err) {
        console.error('Error getting initial session:', err)
        setError(err as Error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    getInitialSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (!mounted) return
        setError(null)
        setSession(currentSession)
        setUser(currentSession?.user ?? null)

        if (currentSession?.user) {
          const userId = currentSession.user.id
          // Skip refetch unless the user actually changed (e.g. TOKEN_REFRESHED
          // fires hourly and on tab refocus with the same identity).
          if (lastFetchedUserId.current !== userId) {
            lastFetchedUserId.current = userId
            // Supabase-js holds an internal auth lock while this callback runs;
            // awaiting a query here deadlocks, so defer the fetch out of it.
            setTimeout(() => {
              if (lastFetchedUserId.current === userId) void fetchProfile(userId)
            }, 0)
          }
        } else {
          lastFetchedUserId.current = null
          setProfile(null)
        }

        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (signInError) throw signInError
    } catch (err) {
      console.error('Error signing in with Google:', err)
      setError(err as Error)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ session, user, profile, loading, error, signInWithGoogle, signOut }),
    [session, user, profile, loading, error, signInWithGoogle, signOut]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
