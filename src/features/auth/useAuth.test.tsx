import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useAuth } from './useAuth'
import { AuthContext } from './AuthContext'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
  },
}))

describe('useAuth', () => {
  it('throws error when used outside of AuthProvider', () => {
    // Suppress console.error for this expected error
    const originalError = console.error
    console.error = () => {}
    
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
    
    console.error = originalError
  })

  it('returns context value when used within AuthProvider', () => {
    const mockContextValue = {
      user: null,
      profile: null,
      session: null,
      loading: false,
      signInWithGoogle: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    }

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthContext.Provider value={mockContextValue}>
        {children}
      </AuthContext.Provider>
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current).toBe(mockContextValue)
  })
})

