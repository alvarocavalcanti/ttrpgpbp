import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { supabase } from './lib/supabase'
import { CURRENT_TERMS_VERSION } from './features/auth/terms'

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('./features/notifications/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

import { usePushNotifications } from './features/notifications/usePushNotifications'

// Placement + consent-boundary tests for the floating banner host (#620,
// #635 review): the push-permission prompt moved out of Lobby into App's
// overlay, so the route gate must also preserve the readiness boundary
// ProtectedRoute enforces (profile loaded, terms current) — otherwise a
// signed-in user stuck at the re-consent gate could enroll in push early.
describe('App permission banner gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('changelog:forever', 'true')
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)
    // Push conditions that would show the prompt if the gate lets it through.
    vi.mocked(usePushNotifications).mockReturnValue({
      isSupported: true,
      needsInstall: false,
      isConfigured: true,
      permission: 'default',
      isSubscribed: false,
      subscribeToPush: vi.fn(),
    } as any)
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  function mockSignedIn(termsVersion: string) {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: null, terms_version: termsVersion },
      error: null,
    })
    const profileChain = { select: () => ({ eq: () => ({ single: mockSingle }) }) }
    const empty = { data: [], error: null }
    const listChain = {
      select: () => listChain,
      eq: () => listChain,
      order: () => Promise.resolve(empty),
      gt: () => Promise.resolve({ count: 0, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      // eslint-disable-next-line unicorn/no-thenable
      then: (cb: any) => Promise.resolve(empty).then(cb),
    }
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'profiles') return profileChain as any
      return listChain as any
    })
  }

  it('hides the prompt while a terms re-acceptance is pending', async () => {
    mockSignedIn('2020-01-01')
    window.history.pushState({}, '', '/')
    render(<App />)

    // Sanity: the re-consent gate (not the Lobby) owns the screen.
    expect(await screen.findByText('Our Terms and Privacy Policy have changed')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Notification permission' })).not.toBeInTheDocument()
  })

  it('shows the prompt in the floating host once the profile is current', async () => {
    mockSignedIn(CURRENT_TERMS_VERSION)
    window.history.pushState({}, '', '/')
    render(<App />)

    const region = await screen.findByRole('region', { name: 'Notification permission' })
    expect(region.closest('[data-testid="app-banner-host"]')).not.toBeNull()
  })
})
