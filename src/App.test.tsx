import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { supabase } from './lib/supabase'
import { trackEvent } from './lib/analytics'

vi.mock('./lib/analytics', () => ({
  trackEvent: vi.fn(),
  trackPageView: vi.fn(),
}))

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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Keep the changelog modal from auto-opening during App-level tests; the
    // dedicated "Change Log" menu item test covers it explicitly.
    localStorage.setItem('changelog:forever', 'true')
    // useChannels fetches unread counts via a single RPC; admin gating uses the
    // is_server_admin RPC. Non-admin by default unless a test overrides it.
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)
  })

  it('renders login page initially when unauthenticated', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    render(<App />)
    
    // Wait for the AuthProvider to resolve loading state
    expect(await screen.findByText('Sign in with your Google account to securely create and access your roleplaying campaigns.')).toBeInTheDocument()
  })

  it('serves the public marketing page to anonymous visitors', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    window.history.pushState({}, '', '/features')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Play your tabletop RPG, one post at a time' })).toBeInTheDocument()
    expect(screen.queryByText('Sign in with your Google account to securely create and access your roleplaying campaigns.')).not.toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('serves the marketing page with a trailing slash', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    window.history.pushState({}, '', '/features/')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Play your tabletop RPG, one post at a time' })).toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('hides the changelog popup on the marketing page for signed-in visitors (#536)', async () => {
    // beforeEach suppresses the modal via changelog:forever; drop the
    // sentinels so the auto-open would fire if the route were not gated.
    localStorage.removeItem('changelog:forever')
    localStorage.removeItem('changelog:seen')

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    window.history.pushState({}, '', '/features')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Play your tabletop RPG, one post at a time' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('renders lobby and lists Profile in the menu drawer when authenticated', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: 'http://example.com/avatar.png', terms_version: '2026-09-24' },
      error: null,
    })
    // Profile fetch: select().eq().single()
    const profileChain = { select: () => ({ eq: () => ({ single: mockSingle }) }) }

    // Lobby/channel queries resolve to empty lists (profiles is handled above).
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

    render(<App />)
    
    expect(await screen.findByText('Role by Post')).toBeInTheDocument()
    expect(await screen.findByText("You haven't joined any channels yet.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('shows Server Admin menu item only for server admins', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Admin', avatar_url: null, server_admin: true, terms_version: '2026-09-24' },
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

    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Server Admin')).toBeInTheDocument()
  })

  it('hides Server Admin menu item for non-admin users', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Regular', avatar_url: null, server_admin: false, terms_version: '2026-09-24' },
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

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.queryByText('Server Admin')).not.toBeInTheDocument()
  })

  it('shows the Help menu item and navigates to the help page', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: null, terms_version: '2026-09-24' },
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

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByText('Help'))
    expect(await screen.findByText('Help Topics')).toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('shows the About menu item and navigates to the About page', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: null, terms_version: '2026-09-24' },
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

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('link', { name: 'About' }))
    expect(await screen.findByRole('heading', { name: 'About Role by Post' })).toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('navigates to the admin page from the menu for server admins', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Admin', avatar_url: null, server_admin: true, terms_version: '2026-09-24' },
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
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('link', { name: 'Server Admin' }))
    expect(await screen.findByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Server Admin')).toBeInTheDocument()
  })

  it('opens the changelog modal from the Change Log menu item', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: null, terms_version: '2026-09-24' },
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

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByText('Change Log'))
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('replaces the entry when the header logo returns to the lobby so back does not re-enter a sub-page', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: null, terms_version: '2026-09-24' },
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

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByText('Help'))
    await screen.findByText('Help Topics')

    fireEvent.click(screen.getByRole('link', { name: 'Role by Post' }))
    expect(await screen.findByText("You haven't joined any channels yet.")).toBeInTheDocument()

    window.history.back()
    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })
    expect(screen.queryByText('Help Topics')).not.toBeInTheDocument()
  })
})

describe('App main menu drawer', () => {
  const swipe = (type: 'touchstart' | 'touchend', x: number, y = 200) => {
    const event = new Event(type, { bubbles: true }) as unknown as TouchEvent
    Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: y }] })
    act(() => {
      window.dispatchEvent(event)
    })
  }

  const renderLobby = async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: null, terms_version: '2026-09-24' },
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

    render(<App />)
    await screen.findByText('Role by Post')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('changelog:forever', 'true')
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  })

  it('opens the drawer from a right-edge swipe and closes on backdrop tap', async () => {
    await renderLobby()

    swipe('touchstart', 380)
    swipe('touchend', 260)
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('menu-backdrop'))
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('closes the drawer on Escape', async () => {
    await renderLobby()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('closes the drawer via the dedicated close button (issue #511)', async () => {
    await renderLobby()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()
    expect(screen.getByTestId('menu-close')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('menu-close'))
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('tracks how the main menu is opened and closed (issue #511)', async () => {
    await renderLobby()

    // Open via hamburger toggle...
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(trackEvent).toHaveBeenCalledWith('menu_open', { menu: 'main', method: 'toggle' })

    // ...close via the dedicated close button...
    fireEvent.click(screen.getByTestId('menu-close'))
    expect(trackEvent).toHaveBeenCalledWith('menu_close', { menu: 'main', method: 'button' })

    // ...reopen via right-edge swipe, close via backdrop tap.
    swipe('touchstart', 380)
    swipe('touchend', 260)
    expect(trackEvent).toHaveBeenCalledWith('menu_open', { menu: 'main', method: 'swipe' })

    fireEvent.click(screen.getByTestId('menu-backdrop'))
    expect(trackEvent).toHaveBeenCalledWith('menu_close', { menu: 'main', method: 'backdrop' })

    // Escape close without a stray event when nothing is open.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trackEvent).not.toHaveBeenCalledWith('menu_close', { menu: 'main', method: 'escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trackEvent).toHaveBeenCalledWith('menu_close', { menu: 'main', method: 'escape' })
  })

  it('hides the backdrop from the a11y tree and traps focus in the drawer (UX-4)', async () => {
    await renderLobby()

    const trigger = screen.getByRole('button', { name: 'Menu' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()

    // Backdrop stays a convenience click target: hidden from the a11y tree,
    // not a focusable role="button".
    const backdrop = screen.getByTestId('menu-backdrop')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop).not.toHaveAttribute('role')

    // The trap moves focus into the drawer on open (the new close X is the
    // first focusable), Tab wraps from the last item back to the first, and
    // closing hands focus back to the trigger.
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    screen.getByRole('button', { name: 'Sign Out' }).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveFocus()
  })

  it('folds search and dark mode into the drawer', async () => {
    await renderLobby()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByLabelText('Search channels in menu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument()
    // The menu also lists the profile as a plain labeled item now.
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
  })

  it('does not open on swipes that start mid-screen', async () => {
    await renderLobby()

    swipe('touchstart', 100)
    swipe('touchend', -20)
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })
})

describe('App messages menu item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('changelog:forever', 'true')
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: [], error: null })
    }) as any)
  })

  it('shows the Messages menu item for regular non-admin users', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Regular User', avatar_url: null, terms_version: '2026-09-24' },
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

    render(<App />)

    await screen.findByText('Role by Post')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.queryByText('Server Admin')).not.toBeInTheDocument()
  })
})
