import { render, screen, fireEvent } from '@testing-library/react'
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
  },
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(await screen.findByText('Sign in to access your campaigns')).toBeInTheDocument()
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
    
    expect(await screen.findByText('RoleByPost')).toBeInTheDocument()
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
    
    expect(await screen.findByText('RoleByPost')).toBeInTheDocument()
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

    render(<App />)

    await screen.findByText('RoleByPost')
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

    await screen.findByText('RoleByPost')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.queryByText('Server Admin')).not.toBeInTheDocument()
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
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    render(<App />)

    await screen.findByText('RoleByPost')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByText('Server Admin'))
    expect(await screen.findByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Server Admin')).toBeInTheDocument()
  })
})

