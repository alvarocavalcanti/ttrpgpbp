import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCurrentSession,
  signInWithGoogle,
  authSignOut,
  fetchProfileRow,
  updateDisplayName,
  deleteAccount,
  subscribeToAuthEvents,
} from './authApi'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  }
}))

const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(), update: vi.fn().mockReturnThis() }

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.from).mockReturnValue(query as any)
  })

  it('subscribeToAuthEvents forwards each auth event session to the callback and unsubscribes', () => {
    const innerCallback = vi.fn()
    const unsubscribe = vi.fn()
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb: any) => {
      cb('SIGNED_IN', { user: { id: 'u1' } })
      return { data: { subscription: { unsubscribe } } } as any
    })

    const { data: { subscription } } = subscribeToAuthEvents(innerCallback)
    expect(innerCallback).toHaveBeenCalledWith({ user: { id: 'u1' } })
    subscription.unsubscribe()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('getCurrentSession unwraps the session from the auth response', async () => {
    const session = { user: { id: 'u1' } }
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session } } as any)

    await expect(getCurrentSession()).resolves.toBe(session)
  })

  it('signInWithGoogle targets the google provider with the current origin', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: {}, error: null } as any)

    await signInWithGoogle()
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  })

  it('authSignOut delegates to supabase auth', async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as any)

    await authSignOut()
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('fetchProfileRow selects the profile columns for the user', () => {
    fetchProfileRow('u1')
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(query.select).toHaveBeenCalledWith('id, display_name, avatar_url, created_at, is_suspended')
    expect(query.eq).toHaveBeenCalledWith('id', 'u1')
    expect(query.single).toHaveBeenCalled()
  })

  it('updateDisplayName writes the display name onto the profile row', () => {
    updateDisplayName('u1', 'Alvaro')
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(query.update).toHaveBeenCalledWith({ display_name: 'Alvaro' })
    expect(query.eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('deleteAccount posts to the delete-account edge function', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: null } as any)

    await deleteAccount()
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' })
  })
})
