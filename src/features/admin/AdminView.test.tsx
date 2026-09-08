import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AdminView } from './AdminView'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { useAppSetting } from '../../hooks/useAppSetting'

function BackProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)} data-testid="back-probe">
      back
    </button>
  )
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() }),
}))

vi.mock('../../hooks/useAppSetting', () => ({
  useAppSetting: vi.fn().mockImplementation((key: string, fallback: any) => {
    const map: Record<string, unknown> = {
      max_channels_per_user: 10,
      image_uploading_enabled: false,
      image_max_size_mb: 5,
      image_retention_days: 0,
    }
    return { value: map[key] ?? fallback, loading: false, error: null, refresh: vi.fn() }
  }),
}))

const adminUser = {
  user: { id: 'admin1' } as any,
  profile: { id: 'admin1', server_admin: true } as any,
}

const makeUser = (over: Record<string, unknown> = {}) => ({
  id: 'u1', display_name: 'Alice', email: 'alice@example.com', channel_count: 3, channels: [],
  last_login_at: '2026-03-01T00:00:00Z', last_message_at: '2026-03-02T00:00:00Z', message_count: 12,
  created_at: '2026-01-01T00:00:00Z', is_suspended: false, avatar_url: null,
  server_admin: false, email_verified: true, provider: 'email',
  ...over,
})

const users = [
  makeUser({ id: 'u1' }),
  makeUser({ id: 'u2', display_name: null, email: 'bob@example.com', channel_count: 0, is_suspended: false, last_login_at: null, message_count: 0 }),
]

const channels = [
  { id: 'c1', name: 'Curse of Strahd', game_system: 'shadowdark', gm_id: 'u1', member_count: 5, created_at: '2026-01-01T00:00:00Z', last_message_at: '2026-02-01T00:00:00Z', gm_display_name: 'Alice' },
  { id: 'c2', name: 'Empty', game_system: 'none', gm_id: null, member_count: 0, created_at: '2026-03-01T00:00:00Z', last_message_at: null, gm_display_name: null },
]

const defaultRpc = () => {
  vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
    if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
    if (fn === 'admin_list_users') return Promise.resolve({ data: users, error: null })
    if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
    if (fn === 'admin_get_image_storage_bytes') return Promise.resolve({ data: 1048576, error: null })
    if (fn === 'admin_get_user_history') return Promise.resolve({ data: [], error: null })
    return Promise.resolve({ data: null, error: null })
  }) as any)
}

// Users-focused mock: supplies the empty arrays the loader requires so a
// custom users payload doesn't trip the malformed-payload guard.
const usersRpc = (overrides: Record<string, any>) => {
  vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
    if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
    if (fn === 'admin_list_channels') return Promise.resolve({ data: [], error: null })
    if (fn === 'admin_get_image_storage_bytes') return Promise.resolve({ data: 0, error: null })
    if (overrides[fn] !== undefined) return Promise.resolve(overrides[fn])
    return Promise.resolve({ data: null, error: null })
  }) as any)
}

describe('AdminView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAppSetting).mockImplementation((key: string, fallback: any) => {
      const map: Record<string, unknown> = {
        max_channels_per_user: 10,
        image_uploading_enabled: false,
        image_max_size_mb: 5,
        image_retention_days: 0,
      }
      return { value: map[key] ?? fallback, loading: false, error: null, refresh: vi.fn() }
    })
    vi.mocked(useAuth).mockReturnValue(adminUser as any)
    defaultRpc()
  })

  const switchToChannelsTab = () =>
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Admin sections' })).getByRole('button', { name: 'Channels' })
    )

  const openUserModal = async (name: string) => {
    await screen.findByText(name)
    fireEvent.click(within(screen.getByText(name).closest('tr') as HTMLTableRowElement).getByRole('button', { name: new RegExp(name) }))
  }

  it('renders stats row with total users, channels, and image storage', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    expect(await screen.findByText('Total Users')).toBeInTheDocument()
    expect(screen.getAllByText('2', { selector: 'div.text-2xl' })).toHaveLength(2)
    expect(screen.getByText('Total Channels')).toBeInTheDocument()
    expect(screen.getByText('Image Storage')).toBeInTheDocument()
    expect(screen.getByText('1 MB', { selector: 'div.text-2xl' })).toBeInTheDocument()
  })

  it('renders users tab by default with channel counts and join dates', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Server Admin')).toBeInTheDocument()
  })

  it('renders channels tab with system, members, and dates', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    switchToChannelsTab()

    expect(await screen.findByText('Curse of Strahd')).toBeInTheDocument()
    expect(screen.getByText('shadowdark')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('badges orphaned channels and claims them as GM', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    switchToChannelsTab()

    expect(await screen.findByText('Orphaned')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('admin_claim_channel', { p_channel_id: 'c2' })
      expect(addToast).toHaveBeenCalledWith('Channel claimed. You are now the GM.', 'success')
    })
  })

  it('shows a toast when claiming fails', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
      if (fn === 'admin_list_users') return Promise.resolve({ data: users, error: null })
      if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
      if (fn === 'admin_claim_channel') return Promise.resolve({ data: null, error: new Error('nope') })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    switchToChannelsTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Claim' }))

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Failed to claim channel.', 'error')
    })
  })

  it('opens the user detail modal on row click and shows email, login, activity, and message count', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')

    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    expect(within(dialog).getByText(/alice@example\.com/)).toBeInTheDocument()
    expect(within(dialog).getByText(/verified/)).toBeInTheDocument()
    expect(within(dialog).getByText(/email/)).toBeInTheDocument()
    expect(within(dialog).getByText('12')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('admin_get_user_history', { p_user_id: 'u1' })
  })

  it('makes the user name a keyboard-reachable button that opens the modal', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    const aliceRow = screen.getByText('Alice').closest('tr') as HTMLTableRowElement
    const nameButton = within(aliceRow).getByRole('button', { name: /Alice/ })
    expect(nameButton.tagName).toBe('BUTTON')

    // Native <button> is keyboard-activatable; simulate the click the browser
    // dispatches on Enter/Space so jsdom covers the keyboard path.
    fireEvent.click(nameButton)

    expect(screen.getByRole('dialog', { name: 'Alice' })).toBeInTheDocument()
  })

  it('shows empty-state fallbacks for a user with no email, login, or activity', async () => {
    const noData = [makeUser({ id: 'u1', email: null, last_login_at: null, last_message_at: null, message_count: 0 })]
    usersRpc({
      admin_list_users: { data: noData, error: null },
      admin_get_user_history: { data: [], error: null },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(within(screen.getByText('Alice').closest('tr') as HTMLTableRowElement).getByRole('button', { name: /Alice/ }))

    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    expect(within(dialog).getByText(/No email on file/)).toBeInTheDocument()
    expect(within(dialog).getAllByText('Never')).toHaveLength(2) // last login + last activity
    expect(within(dialog).getByText('Not in any channels.')).toBeInTheDocument()
    expect(await within(dialog).findByText('No moderation history.')).toBeInTheDocument()
  })

  it('lists channel memberships with character names and blocked badges', async () => {
    const withChannels = [makeUser({
      id: 'u1',
      channels: [
        { name: 'Strahd', character_name: 'Aragorn', joined_at: '2026-01-01', is_blocked: false, is_active_player: true },
        { name: 'Loot', character_name: '', joined_at: '2026-02-01', is_blocked: true, is_active_player: false },
      ],
    })]
    usersRpc({
      admin_list_users: { data: withChannels, error: null },
      admin_get_user_history: { data: [], error: null },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(within(screen.getByText('Alice').closest('tr') as HTMLTableRowElement).getByRole('button', { name: /Alice/ }))

    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    expect(within(dialog).getByText(/Strahd — Aragorn/)).toBeInTheDocument()
    expect(within(dialog).getByText('Blocked')).toBeInTheDocument()
    expect(within(dialog).getByText('Blocked from 1 channel')).toBeInTheDocument()
  })

  it('shows moderation history with reasons', async () => {
    usersRpc({
      admin_list_users: { data: users, error: null },
      admin_get_user_history: { data: [{ id: 'h1', action: 'suspend_user', reason: 'Spamming', admin_name: 'Root', created_at: '2026-02-01T00:00:00Z' }], error: null },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')

    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    expect(await within(dialog).findByText('Suspended')).toBeInTheDocument()
    expect(within(dialog).getByText(/by Root/)).toBeInTheDocument()
    expect(within(dialog).getByText('Spamming')).toBeInTheDocument()
  })

  it('shows an error message when history fetch fails but keeps the modal usable', async () => {
    usersRpc({
      admin_list_users: { data: users, error: null },
      admin_get_user_history: { data: null, error: new Error('nope') },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')

    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    expect(await within(dialog).findByText('nope')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
  })

  it('handles a rejected history RPC without leaving the modal stuck loading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    usersRpc({
      admin_list_users: { data: users, error: null },
      admin_get_user_history: Promise.reject(new Error('boom')),
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')

    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    expect(await within(dialog).findByText('Failed to load audit history.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
  })

  it('closes the modal via the close button', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')
    expect(screen.getByRole('dialog', { name: 'Alice' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Alice' })).getByRole('button', { name: 'Close options' }))
    expect(screen.queryByRole('dialog', { name: 'Alice' })).not.toBeInTheDocument()
  })

  it('does not suspend when the reason sheet is cancelled', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')
    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    const sheet = screen.getByRole('dialog', { name: 'Suspend Alice?' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Suspend Alice?' })).not.toBeInTheDocument()
    expect(
      vi.mocked(supabase.rpc).mock.calls.filter(([fn]) => fn === 'admin_suspend_user')
    ).toHaveLength(0)
  })

  it('suspends user with trimmed reason and updates status UI', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')
    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    const sheet = screen.getByRole('dialog', { name: 'Suspend Alice?' })
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: '  Spamming  ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('admin_suspend_user', {
        p_user_id: 'u1',
        p_suspend: true,
        p_reason: 'Spamming',
      })
    })

    expect(within(screen.getByRole('dialog', { name: 'Alice' })).getByRole('button', { name: 'Unsuspend' })).toBeInTheDocument()
  })

  it('un-suspends a user from the modal', async () => {
    const suspended = [makeUser({ id: 'u1', is_suspended: true })]
    usersRpc({
      admin_list_users: { data: suspended, error: null },
      admin_get_user_history: { data: [], error: null },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')
    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unsuspend' }))

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsuspend Alice?' })).getByRole('button', { name: 'Unsuspend' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('admin_suspend_user', {
        p_user_id: 'u1',
        p_suspend: false,
        p_reason: 'No reason provided',
      })
    })

    expect(within(screen.getByRole('dialog', { name: 'Alice' })).getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
  })

  it('shows a toast when suspend action fails', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    usersRpc({
      admin_list_users: { data: users, error: null },
      admin_get_user_history: { data: [], error: null },
      admin_suspend_user: { data: null, error: new Error('nope') },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')
    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Suspend Alice?' })).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Failed to suspend user.', 'error')
    })
  })

  it('caps the suspend reason at input via maxLength', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await openUserModal('Alice')
    const dialog = screen.getByRole('dialog', { name: 'Alice' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    const input = within(screen.getByRole('dialog', { name: 'Suspend Alice?' })).getByLabelText('Reason')
    expect(input).toHaveAttribute('maxLength', '200')
    expect(
      vi.mocked(supabase.rpc).mock.calls.filter(([fn]) => fn === 'admin_suspend_user')
    ).toHaveLength(0)
  })

  it('rejects saving a limit below 10', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const input = await screen.findByLabelText('Maximum Channels per user')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Maximum channels per user must be at least 10.', 'error')
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('saves a valid limit via app_settings upsert', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const input = await screen.findByLabelText('Maximum Channels per user')
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        [{ key: 'max_channels_per_user', value: 15 }],
        { onConflict: 'key' }
      )
      expect(addToast).toHaveBeenCalledWith('Channel limit updated. Existing members are kept in their channels.', 'success')
    })
  })

  it('shows error state when RPCs fail', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
      return Promise.resolve({ data: null, error: new Error('DB down') })
    }) as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to load admin data.')).toBeInTheDocument()
  })

  it('captures a broken admin_list_users (42804) so the admin screen is unusable', async () => {
    const apiError = { code: '42804', message: 'structure of query does not match function result type' }
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: true, error: null })
      if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
      if (fn === 'admin_list_users') return Promise.resolve({ data: null, error: apiError })
      return Promise.resolve({ data: null, error: null })
    }) as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to load admin data.')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Curse of Strahd')).not.toBeInTheDocument()
  })

  it('redirects non-admin users away', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { id: 'u1', server_admin: false } as any,
    } as any)

    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminView />} />
          <Route path="/" element={<BackProbe />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.queryByText('Server Admin')).not.toBeInTheDocument()
  })

  it('replaces the redirect to lobby so back from the lobby does not re-enter admin', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { id: 'u1', server_admin: false } as any,
    } as any)

    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'is_server_admin') return Promise.resolve({ data: false, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminView />} />
          <Route path="/" element={<BackProbe />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByTestId('back-probe')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-probe'))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()
  })

  it('uses the configured limit for the input default', async () => {
    vi.mocked(useAppSetting).mockReturnValue({ value: 12, loading: false, error: null, refresh: vi.fn() } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByLabelText('Maximum Channels per user')).toHaveValue(12)
  })

  it('renders the image upload settings with the configured values', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    const enabledToggle = await screen.findByLabelText('Allow image uploads (channel avatars)')
    expect(enabledToggle).not.toBeChecked()
    expect(screen.getByLabelText('Maximum image size (MB)')).toHaveValue(5)
    expect(screen.getByLabelText('Auto-delete images older than (days)')).toHaveValue(0)
  })

  it('saves image upload settings via app_settings upsert', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    fireEvent.click(await screen.findByLabelText('Allow image uploads (channel avatars)'))
    fireEvent.change(screen.getByLabelText('Maximum image size (MB)'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Auto-delete images older than (days)'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Image Settings' }))

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          { key: 'image_uploading_enabled', value: true },
          { key: 'image_max_size_mb', value: 8 },
          { key: 'image_retention_days', value: 30 },
        ],
        { onConflict: 'key' }
      )
      expect(addToast).toHaveBeenCalledWith('Image upload settings updated.', 'success')
    })
  })

  it('rejects an out-of-range image size', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    const mockUpsert = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    await screen.findByLabelText('Allow image uploads (channel avatars)')
    fireEvent.change(screen.getByLabelText('Maximum image size (MB)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Image Settings' }))

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Maximum image size must be between 1 and 50 MB.', 'error')
    })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range image retention', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    const mockUpsert = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any)

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    await screen.findByLabelText('Allow image uploads (channel avatars)')
    fireEvent.change(screen.getByLabelText('Auto-delete images older than (days)'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Image Settings' }))

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Image retention must be between 0 and 365 days.', 'error')
    })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('wraps the users table in a horizontally scrollable container', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    const table = await screen.findByRole('table')
    expect(table.parentElement).toHaveClass('overflow-x-auto')
  })

  it('wraps the channels table in a horizontally scrollable container', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    switchToChannelsTab()

    const table = await screen.findByRole('table')
    expect(table.parentElement).toHaveClass('overflow-x-auto')
  })

  it('sorts users by channel count ascending and toggles to descending', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    const channelsHeader = screen.getAllByRole('columnheader', { name: 'Channels' })[0]

    fireEvent.click(within(channelsHeader).getByRole('button', { name: 'Channels' }))
    expect(channelsHeader).toHaveAttribute('aria-sort', 'ascending')
    let rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('bob@example.com')).toBeInTheDocument()

    fireEvent.click(within(channelsHeader).getByRole('button', { name: /Channels/ }))
    expect(channelsHeader).toHaveAttribute('aria-sort', 'descending')
    rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Alice')).toBeInTheDocument()
  })

  it('sorts channels by member count ascending', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    switchToChannelsTab()

    fireEvent.click(within(await screen.findByRole('columnheader', { name: 'Members' })).getByRole('button', { name: 'Members' }))
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Empty')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Curse of Strahd')).toBeInTheDocument()
  })

  it('shows a sort indicator on the active column', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    const nameHeader = screen.getAllByRole('columnheader', { name: /Name/ })[0]
    expect(nameHeader.textContent).toContain('▲')
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
  })

  it('exposes sortable headers as keyboard-operable buttons with aria-sort on the column', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    const nameHeader = screen.getAllByRole('columnheader', { name: /Name/ })[0]
    const sortButton = within(nameHeader).getByRole('button', { name: /Name/ })
    expect(sortButton.tagName).toBe('BUTTON')
    expect(sortButton).toHaveClass('focus:ring-2', 'focus:ring-inset')
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(sortButton)
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('filters users by search text on name and email', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.change(screen.getByPlaceholderText('Search by name or email…'), { target: { value: 'bob' } })
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('shows an empty state when search matches nothing', async () => {
    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.change(screen.getByPlaceholderText('Search by name or email…'), { target: { value: 'zzz' } })
    expect(screen.getByText('No users match your search.')).toBeInTheDocument()
  })

  it('filters users to the Suspended status', async () => {
    const mixed = [
      makeUser({ id: 'u1', is_suspended: true }),
      makeUser({ id: 'u2', display_name: 'Bob', email: 'bob@x', is_suspended: false, last_login_at: '2026-03-01T00:00:00Z' }),
    ]
    usersRpc({
      admin_list_users: { data: mixed, error: null },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Suspended', pressed: false }))

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('filters users to Inactive based on stale or missing login', async () => {
    const now = Date.now()
    const days = 31 * 24 * 60 * 60 * 1000
    const mixed = [
      makeUser({ id: 'u1', display_name: 'Alice', email: 'a@x', last_login_at: new Date(now - days).toISOString() }),
      makeUser({ id: 'u2', display_name: 'Never', email: 'n@x', last_login_at: null }),
      makeUser({ id: 'u3', display_name: 'Recent', email: 'r@x', last_login_at: new Date(now - 1000).toISOString() }),
    ]
    usersRpc({
      admin_list_users: { data: mixed, error: null },
    })

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    await screen.findByText('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Inactive', pressed: false }))

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Never')).toBeInTheDocument()
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
  })
})
