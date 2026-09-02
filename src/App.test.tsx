import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { supabase } from './lib/supabase'

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

  it('renders lobby and avatar when authenticated with profile avatar', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: 'Test User', avatar_url: 'http://example.com/avatar.png' },
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
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Avatar' })).toBeInTheDocument()
  })

  it('renders placeholder avatar when authenticated without profile avatar', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: '123', email: 'test@example.com' } } },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: '123', display_name: null, avatar_url: null },
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
    
    expect(await screen.findByText('Role by Post')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('T')).toBeInTheDocument() // The placeholder 'T' from email
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
      data: { id: '123', display_name: 'Admin', avatar_url: null, server_admin: true },
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
      data: { id: '123', display_name: 'Regular', avatar_url: null, server_admin: false },
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
      data: { id: '123', display_name: 'Test User', avatar_url: null },
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
      data: { id: '123', display_name: 'Test User', avatar_url: null },
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
      data: { id: '123', display_name: 'Admin', avatar_url: null, server_admin: true },
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
      data: { id: '123', display_name: 'Test User', avatar_url: null },
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
      data: { id: '123', display_name: 'Test User', avatar_url: null },
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
      data: { id: '123', display_name: 'Test User', avatar_url: null },
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

    fireEvent.click(screen.getByRole('navigation', { name: 'Main menu' }).previousSibling as Element)
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('closes the drawer via the close button', async () => {
    await renderLobby()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('does not open on swipes that start mid-screen', async () => {
    await renderLobby()

    swipe('touchstart', 100)
    swipe('touchend', -20)
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })
})
