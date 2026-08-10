import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AdminView } from './AdminView'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { useAppSetting } from '../../hooks/useAppSetting'

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
  useAppSetting: vi.fn().mockReturnValue({ value: 10, loading: false, error: null, refresh: vi.fn() }),
}))

const adminUser = {
  user: { id: 'admin1' } as any,
  profile: { id: 'admin1', server_admin: true } as any,
}

const users = [
  { id: 'u1', display_name: 'Alice', email: 'alice@example.com', channel_count: 3, created_at: '2026-01-01T00:00:00Z' },
  { id: 'u2', display_name: null, email: 'bob@example.com', channel_count: 0, created_at: '2026-02-01T00:00:00Z' },
]

const channels = [
  { id: 'c1', name: 'Curse of Strahd', game_system: 'shadowdark', member_count: 5, created_at: '2026-01-01T00:00:00Z', last_message_at: '2026-02-01T00:00:00Z', gm_display_name: 'Alice' },
  { id: 'c2', name: 'Empty', game_system: 'none', member_count: 0, created_at: '2026-03-01T00:00:00Z', last_message_at: null, gm_display_name: null },
]

describe('AdminView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(adminUser as any)
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'admin_list_users') return Promise.resolve({ data: users, error: null })
      if (fn === 'admin_list_channels') return Promise.resolve({ data: channels, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)
  })

  it('renders users tab by default with channel counts', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Channels' }))

    expect(await screen.findByText('Curse of Strahd')).toBeInTheDocument()
    expect(screen.getByText('shadowdark')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Empty')).toBeInTheDocument()
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
        { key: 'max_channels_per_user', value: 15 },
        { onConflict: 'key' }
      )
      expect(addToast).toHaveBeenCalledWith('Channel limit updated. Existing members are kept in their channels.', 'success')
    })
  })

  it('shows error state when RPCs fail', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('DB down') } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <AdminView />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to load admin data.')).toBeInTheDocument()
  })

  it('redirects non-admin users away', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as any,
      profile: { id: 'u1', server_admin: false } as any,
    } as any)

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminView />
      </MemoryRouter>
    )

    expect(screen.queryByText('Server Admin')).not.toBeInTheDocument()
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
})
