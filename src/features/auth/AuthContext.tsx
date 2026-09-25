import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { ProfileRowSchema, parseRow } from '../validation/rowSchemas'
import { authSignOut, confirmAge, confirmTerms, fetchProfileRow, getCurrentSession, signInWithGoogle as apiSignInWithGoogle, subscribeToAuthEvents } from './authApi'
import { CURRENT_TERMS_VERSION, TERMS_AGREED_KEY } from './terms'
import type { Database } from '../../types/database'

// server_admin is not readable from the profiles API anymore (H1/P0-3); admin
// status comes from the is_server_admin() RPC via useIsServerAdmin.
type Profile = Omit<Database['public']['Tables']['profiles']['Row'], 'server_admin'>

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  error: Error | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const lastFetchedUserId = useRef<string | null>(null)
  const confirmedAgeFor = useRef<string | null>(null)
  const confirmedTermsFor = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchProfile(userId: string) {
      try {
        const { data } = await fetchProfileRow(userId)

        if (mounted) setProfile(parseRow(ProfileRowSchema, data) as Profile | null)
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
        const currentSession = await getCurrentSession()
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

    const { data: { subscription } } = subscribeToAuthEvents(
      (currentSession) => {
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

  // Re-fetches the signed-in user's profile so direct profile writes (e.g. the
  // display-name save in ProfileSettings) are reflected in context state
  // without waiting for an auth event (ARCH-4). Declared before the stamping
  // effects below because the terms effect refreshes through it.
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return
    const userId = user.id
    try {
      const { data, error: fetchError } = await fetchProfileRow(userId)
      if (fetchError) throw fetchError
      // An in-flight refresh must not outlive its identity: sign-out clears
      // the ref, an account switch points it at the new id — either way the
      // stale response would otherwise overwrite the newer profile state.
      if (lastFetchedUserId.current !== userId) return
      setProfile(parseRow(ProfileRowSchema, data) as Profile | null)
    } catch (err) {
      // Keep the previously-loaded profile so a transient failure doesn't
      // wipe the UI (mirrors fetchProfile's resilience, UX#16).
      console.error('Error refreshing profile:', err)
    }
  }, [user?.id])

  // Stamp server-side age-confirmation evidence once per user, only when the
  // client checkbox was accepted (localStorage flag). The RPC is idempotent.
  // The user is marked confirmed only after the RPC succeeds, so a failed call
  // is retried on the next auth event instead of being silently dropped.
  useEffect(() => {
    if (loading || !user) return
    if (localStorage.getItem('age-confirmed') !== 'true') return
    if (confirmedAgeFor.current === user.id) return
    const userId = user.id
    void confirmAge()
      .then(() => { confirmedAgeFor.current = userId })
      .catch((err) => console.error('Error confirming age:', err))
  }, [loading, user])

  // Stamp server-side terms-acceptance evidence once per user, only when this
  // device recorded an explicit sign-in checkbox agreement for the CURRENT
  // version. A terms bump leaves the stored agreement behind, so a new version
  // is never stamped on load without fresh checkbox evidence — the re-consent
  // gate stays the path for those (#562 review). The user is marked accepted
  // only after the RPC succeeds, so a failed call is retried on the next auth
  // event instead of being silently dropped (same pattern as the age effect).
  useEffect(() => {
    if (loading || !user || !profile) return
    if (profile.terms_version === CURRENT_TERMS_VERSION) return
    if (localStorage.getItem(TERMS_AGREED_KEY) !== CURRENT_TERMS_VERSION) return
    const stampKey = `${user.id}:${CURRENT_TERMS_VERSION}`
    if (confirmedTermsFor.current === stampKey) return
    void confirmTerms(CURRENT_TERMS_VERSION)
      .then(() => {
        confirmedTermsFor.current = stampKey
        return refreshProfile()
      })
      .catch((err) => console.error('Error confirming terms:', err))
  }, [loading, user, profile, refreshProfile])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    try {
      const { error: signInError } = await apiSignInWithGoogle()
      if (signInError) throw signInError
    } catch (err) {
      console.error('Error signing in with Google:', err)
      setError(err as Error)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    // The age-confirmation and terms-agreement flags are per-browser, not
    // per-account: leaving them set would pre-check the box for whoever signs
    // in next and let confirm_age()/confirm_terms() stamp evidence they never
    // agreed to.
    localStorage.removeItem('age-confirmed')
    localStorage.removeItem(TERMS_AGREED_KEY)
    await authSignOut()
  }, [])

  const value = useMemo(
    () => ({ session, user, profile, loading, error, signInWithGoogle, signOut, refreshProfile }),
    [session, user, profile, loading, error, signInWithGoogle, signOut, refreshProfile]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
