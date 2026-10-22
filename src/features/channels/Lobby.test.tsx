import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Lobby } from './Lobby'
import { useChannels } from './useChannels'
import { usePublicChannels } from './usePublicChannels'
import { usePendingJoinRequestCounts } from './usePendingJoinRequestCounts'
import { useMyJoinRequestDecisions } from './useMyJoinRequestDecisions'
import { MemoryRouter, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import { usePushNotifications } from '../notifications/usePushNotifications'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { trackEvent } from '../../lib/analytics'

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

vi.mock('./useChannels', () => ({
  useChannels: vi.fn()
}))

vi.mock('./usePublicChannels', () => ({
  usePublicChannels: vi.fn()
}))

vi.mock('./usePendingJoinRequestCounts', () => ({
  usePendingJoinRequestCounts: vi.fn()
}))

vi.mock('./useMyJoinRequestDecisions', () => ({
  useMyJoinRequestDecisions: vi.fn()
}))

vi.mock('./PublicChannelDetailSheet', () => ({
  PublicChannelDetailSheet: ({ channelId }: { channelId: string }) => (
    <div data-testid="detail-sheet">{channelId}</div>
  )
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  trackEvent: vi.fn(),
}))

vi.mock('./CreateChannelModal', () => ({
  CreateChannelModal: vi.fn(() => <div data-testid="create-modal"><h2>Create a New Channel</h2></div>)
}))

vi.mock('../notifications/usePushNotifications', () => ({
  usePushNotifications: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('../../hooks/useAppSetting', () => ({
  useAppSetting: vi.fn().mockReturnValue({ value: 10, loading: false, error: null, refresh: vi.fn() })
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, profile: null })
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() })
}))

// A channel-less user now lands on Discover (where the My Games first-run prompt
// deliberately does not appear), so the empty-state tests ask for the My Games
// tab explicitly.
function renderEmptyMyGames() {
  return render(
    <MemoryRouter initialEntries={['/?tab=my']}>
      <Routes>
        <Route path="/" element={<Lobby />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Lobby', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: true } as any
    } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as any)
    vi.mocked(usePublicChannels).mockReturnValue({
      channels: [],
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: false,
      refetch: vi.fn(),
      loadMore: vi.fn(),
    } as any)
    // No pending applications unless a test says otherwise (#674).
    vi.mocked(usePendingJoinRequestCounts).mockReturnValue({})
    // No decided applications unless a test says otherwise (#722).
    vi.mocked(useMyJoinRequestDecisions).mockReturnValue({
      decisions: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      dismiss: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('renders loading state', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    })

    const { container } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders empty state when no channels exist', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    renderEmptyMyGames()
    expect(screen.getByText("You haven't joined any channels yet.")).toBeInTheDocument()
  })

  it('fills remaining viewport space instead of hard-coding a fixed chrome height', () => {
    // Regression test for #396: the root used min-h-[calc(100vh-73px)], which
    // assumed the header + banners above <main> are exactly 73px tall. PWA
    // banners (#385/#387), large text-size, and mobile vh-vs-dvh all make the
    // real chrome taller, so the forced min-height overflowed the viewport and
    // the lobby always got a vertical scrollbar. It must now flex to whatever
    // space the actual chrome leaves behind (no magic number).
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { container } = render(<Lobby />, { wrapper: MemoryRouter })
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('flex-1')
    expect(root.className).not.toMatch(/min-h-\[calc/)
  })

  it('channel rows have taller vertical padding for comfortable mobile touch targets', () => {
    // Regression test for #443: rows were shortened to py-1.5 during the
    // lobby tidy-up, making them hard to tap on phones. WhatsApp-style
    // spacing (py-3) is the floor for the row height.
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: 'c1',
          name: 'Adventure',
          avatar_url: null,
          gm_id: 'gm-1',
          unread_count: 0,
          last_message_at: null,
          last_message_preview: null,
        },
      ] as any,
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { container } = render(<Lobby />, { wrapper: MemoryRouter })
    const row = container.querySelector('ul li a > div') as HTMLElement
    expect(row).toHaveClass('py-3')
    expect(row.className).not.toContain('py-1.5')
  })

  it('empty state offers create-channel and invite-link paths', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    renderEmptyMyGames()
    expect(screen.getByTestId('empty-lobby-create')).toBeInTheDocument()
    expect(screen.getByLabelText('Paste an invite link')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('empty-lobby-create'))
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
  })

  it('empty state rejects an invalid invite link', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    renderEmptyMyGames()
    fireEvent.change(screen.getByLabelText('Paste an invite link'), { target: { value: 'not-a-link' } })
    fireEvent.submit(screen.getByLabelText('Paste an invite link').closest('form')!)

    expect(screen.getByRole('alert')).toHaveTextContent(/invite link/i)
  })

  it('empty state navigates to the join page from a pasted invite link', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/?tab=my']}>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/join/:id" element={<div data-testid="join-page" />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(
      screen.getByLabelText('Paste an invite link'),
      { target: { value: 'https://rolebypost.app/join/123e4567-e89b-12d3-a456-426614174000' } }
    )
    fireEvent.submit(screen.getByLabelText('Paste an invite link').closest('form')!)

    expect(screen.getByTestId('join-page')).toBeInTheDocument()
  })

  it('renders error state with an in-place Retry that refetches', () => {
    const refetch = vi.fn()
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: new Error('DB down'),
      refetch,
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load channels/)
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry).toBeInTheDocument()
    // Touch target (CodeRabbit): Retry is a primary recovery action on
    // mobile — 44px box, not a padded text link.
    expect(retry.className).toContain('min-h-11')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders channels correctly with unread counts', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { 
          id: '1', 
          name: 'My Channel', 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.getByText('My Channel')).toBeInTheDocument()
    // No last message yet → placeholder preview.
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    // Unread shows as a compact count-only pill (#468).
    expect(screen.getByLabelText('5 unread messages')).toHaveTextContent('5')
  })

  it('labels a single unread message in the singular', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'One', unread_count: 1 } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    const pill = screen.getByLabelText('1 unread message')
    expect(pill).toHaveTextContent('1')
    expect(pill).toHaveAttribute('role', 'img')
  })

  it('caps the unread count pill at 99+', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'Busy', unread_count: 150 } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    const pill = screen.getByLabelText('99+ unread messages')
    expect(pill).toHaveTextContent('99+')
    // role=img makes the aria-label meaningful to SRs; red-600 keeps the count
    // at WCAG AA contrast on white/red (#496 review).
    expect(pill).toHaveAttribute('role', 'img')
    expect(pill).toHaveClass('bg-red-600')
  })

  it('renders the channel name larger than the message preview (#523)', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'Talk', last_message_preview: 'Hero: *waves*', unread_count: 0 } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    const preview = screen.getByText('Hero: waves')
    expect(preview).toHaveClass('text-sm')
    expect(screen.getByText('Talk')).toHaveClass('text-base')
  })

  it('shows a short timestamp and a stripped message preview per channel', () => {
    const today = new Date()
    const hh = String(today.getHours()).padStart(2, '0')
    const mi = String(today.getMinutes()).padStart(2, '0')

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        // Same-day message → HH:MM; preview has markdown stripped.
        {
          id: '1',
          name: 'Today',
          last_message_at: today.toISOString(),
          last_message_preview: 'Roll a **d20** and _win_',
          member: { character_name: 'Hero' },
        } as any,
        // Older message → DD/MM/YYYY.
        {
          id: '2',
          name: 'Old',
          last_message_at: '2020-05-04T10:00:00Z',
          last_message_preview: 'The tale begins...',
          member: { character_name: 'Hero' },
        } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    expect(screen.getByText(`${hh}:${mi}`)).toBeInTheDocument()
    expect(screen.getByText('Roll a d20 and win')).toBeInTheDocument()
    expect(screen.getByText('04/05/2020')).toBeInTheDocument()
    expect(screen.getByText('The tale begins...')).toBeInTheDocument()
  })

  it('strips complete and DB-truncated mention chips from the preview (#606)', () => {
    // The DB caps the stored preview at 120 chars of raw markdown, so a long
    // message can slice a `[@Name](user:uuid)` chip in half — the preview must
    // never show the raw `[@…` or `](user:…` fragments.
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: 'Mention',
          last_message_preview: 'Hero: [@Sir Reginald the Bold](user:6f1e2d3c-4b5a-6789-0123-456789abcdef) charges!',
          member: { character_name: 'Hero' },
        } as any,
        {
          id: '2',
          name: 'TruncatedUrl',
          last_message_preview: 'Hero: [@Hero](user:6f1e2d3c-4b5a-6789-0123-456',
          member: { character_name: 'Hero' },
        } as any,
        {
          id: '3',
          name: 'TruncatedLabel',
          last_message_preview: 'Hero: the ground shakes as the dragon stirs [@Sir Reginald the ',
          member: { character_name: 'Hero' },
        } as any,
        {
          id: '4',
          name: 'AllAndImage',
          last_message_preview: 'Roll init [@all](user:all), look ![tavern map](https://x/m.pn',
          member: { character_name: 'Hero' },
        } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    expect(screen.getByText('Hero: @Sir Reginald the Bold charges!')).toBeInTheDocument()
    expect(screen.getByText('Hero: @Hero')).toBeInTheDocument()
    expect(screen.getByText('Hero: the ground shakes as the dragon stirs @Sir Reginald the')).toBeInTheDocument()
    expect(screen.getByText('Roll init @all, look tavern map')).toBeInTheDocument()
    expect(screen.queryByText(/\[@/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\]\(user:/)).not.toBeInTheDocument()
  })

  it('collapses spoiler content in the preview, including DB-truncated orphans (#709)', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: 'Secret',
          last_message_preview: 'Hero: Look out ||the bridge is trapped|| today',
          member: { character_name: 'Hero' },
        } as any,
        {
          id: '2',
          name: 'Truncated',
          last_message_preview: 'Hero: Look out ||the bridge is trap',
          member: { character_name: 'Hero' },
        } as any,
        {
          id: '3',
          name: 'TruncatedAtCloser',
          last_message_preview: 'Hero: Look out ||the bridge is tra|',
          member: { character_name: 'Hero' },
        } as any,
        {
          id: '4',
          name: 'CodePipes',
          last_message_preview: 'Hero: `a || b` and ||secret||',
          member: { character_name: 'Hero' },
        } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    expect(screen.getByText('Hero: Look out (spoiler) today')).toBeInTheDocument()
    expect(screen.getAllByText('Hero: Look out (spoiler)')).toHaveLength(2)
    expect(screen.getByText('Hero: a || b and (spoiler)')).toBeInTheDocument()
    expect(screen.queryByText(/bridge/)).not.toBeInTheDocument()
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
  })

  it('never pairs a || inside a tilde-fenced block with a spoiler delimiter', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: 'Tilde',
          last_message_preview: 'Hero: ~~~\na || b\n~~~\nand ||secret||',
          member: { character_name: 'Hero' },
        } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    expect(screen.getByText(/and \(spoiler\)/)).toBeInTheDocument()
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
  })
  it('truncates a long channel name without pushing the unread badge out of the row', () => {
    // Regression test for #369: the row's name container must allow its
    // truncate class to shrink, otherwise an 80-char name (the DB max) pushes
    // the badge and role pills out of the viewport.
    const longName = 'A'.repeat(80)
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: longName,
          gm_id: 'gm-1',
          member: { character_name: 'Hero' },
          unread_count: 5
        } as any
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const nameEl = screen.getByText(longName)
    expect(nameEl).toHaveClass('truncate')

    // The flex container holding avatar + name must be shrinkable so the
    // truncate can engage and the badge/pills stay on screen.
    const nameContainer = nameEl.parentElement as HTMLElement
    expect(nameContainer).toHaveClass('min-w-0')

    expect(screen.getByLabelText('5 unread messages')).toHaveTextContent('5')
    expect(screen.queryByText('Player')).not.toBeInTheDocument()
  })

  it('keeps the unread pill on one line next to the truncated name (#428)', () => {
    // Regression test for #428: on narrow screens the flex row squeezed the
    // unread badge until its text wrapped. The count pill must never shrink
    // below its content (the name truncates instead).
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: 'A'.repeat(80),
          gm_id: 'gm-1',
          member: { character_name: 'Hero' },
          unread_count: 4
        } as any
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const pill = screen.getByLabelText('4 unread messages')
    expect(pill).toHaveTextContent('4')
    expect(pill).toHaveClass('flex-shrink-0')
  })

  it('hides unread counts if badge_enabled is false', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: false } as any
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { 
          id: '1', 
          name: 'My Channel', 
          member: { character_name: 'Hero' },
          unread_count: 5 
        } as any
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    expect(screen.queryByLabelText('5 unread messages')).not.toBeInTheDocument()
  })

  it('refreshes the launcher badge from the server total, not the local channel sum', async () => {
    vi.stubGlobal('navigator', {
      setAppBadge: vi.fn().mockResolvedValue(true),
      clearAppBadge: vi.fn().mockResolvedValue(true)
    })
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    // Server total (channels + admin, #517) differs from the local 5 + 2 on
    // purpose: the badge must follow the server number.
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 9, error: null } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: 'My One',
          member: { character_name: 'Hero' },
          unread_count: 5
        } as any,
        {
          id: '2',
          name: 'My Two',
          member: { character_name: 'Hero2' },
          unread_count: 2
        } as any
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { unmount } = render(<Lobby />, { wrapper: MemoryRouter })
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('get_user_unread_total', { p_user_id: 'u1' }))
    expect(navigator.setAppBadge).toHaveBeenCalledWith(9)

    // Clear badge when the server total is zero
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 0, error: null } as any)
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        {
          id: '1',
          name: 'My One',
          member: { character_name: 'Hero' },
          unread_count: 0
        } as any
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    unmount()
    render(<Lobby />, { wrapper: MemoryRouter })
    await waitFor(() => expect(navigator.clearAppBadge).toHaveBeenCalled())
    // Restore the signed-out default for the tests below.
    vi.mocked(useAuth).mockReturnValue({ user: null, profile: null } as any)
  })

  it('clears badge when badge_enabled is false but navigator has clearAppBadge', async () => {
    vi.stubGlobal('navigator', {
      clearAppBadge: vi.fn().mockResolvedValue(true)
    })
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 3, error: null } as any)

    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: false } as any
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })
    await waitFor(() => expect(navigator.clearAppBadge).toHaveBeenCalled())
    // Restore the signed-out default for the tests below.
    vi.mocked(useAuth).mockReturnValue({ user: null, profile: null } as any)
  })

  it('renders create channel button and opens modal', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })
    
    render(<Lobby />, { wrapper: MemoryRouter })
    
    const createBtn = screen.getByRole('button', { name: 'Create Channel' })
    expect(createBtn).toBeInTheDocument()
    
    // Clicking should open the modal which has the heading 'Create a New Channel'
    fireEvent.click(createBtn)
    expect(screen.getByText('Create a New Channel')).toBeInTheDocument()
  })

  it('greys out and blocks create button at channel cap for non-admins', () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() })

    vi.mocked(useChannels).mockReturnValue({
      myChannels: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `Channel ${i}`,
        member: { character_name: 'Hero' }
      }) as any),
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const createBtn = screen.getByRole('button', { name: 'Create Channel' })
    expect(createBtn).toHaveAttribute('aria-disabled', 'true')

    // jsdom suppresses clicks on disabled buttons; the wrapper owns the onClick
    // so the toast still fires in the browser when a capped user clicks the FAB.
    fireEvent.click(screen.getByTestId('create-channel-fab'))
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Channel limit reached'), 'error')
    expect(screen.queryByText('Create a New Channel')).not.toBeInTheDocument()
  })

  it('does not cap server admins', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' },
      profile: { server_admin: true }
    } as any)

    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        name: `Channel ${i}`,
        member: { character_name: 'Hero' }
      }) as any),
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    const createBtn = screen.getByRole('button', { name: 'Create Channel' })
    await waitFor(() => expect(createBtn).not.toBeDisabled())

    fireEvent.click(createBtn)
    expect(screen.getByText('Create a New Channel')).toBeInTheDocument()
  })

  it('shows a GM chip inline on channels the user runs and no Player badge', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' },
      profile: { server_admin: false }
    } as any)

    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'My GM Channel', gm_id: 'u1', member: { character_name: 'Hero' } } as any,
        { id: '2', name: 'Someone Elses', gm_id: 'u2', member: { character_name: 'Sidekick' } } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Lobby />, { wrapper: MemoryRouter })

    expect(screen.getAllByText('GM')).toHaveLength(1)
    expect(screen.queryByText('Player')).not.toBeInTheDocument()

    const gmLink = screen.getByText('My GM Channel').closest('a')
    expect(gmLink).toHaveTextContent('GM')
    const playerChannelLink = screen.getByText('Someone Elses').closest('a')
    expect(playerChannelLink).not.toHaveTextContent('GM')
  })

  it('renders the channel avatar image when set', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'My Channel', avatar_url: 'https://img/av.jpg', member: { character_name: 'Hero' } } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { getByTestId } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(getByTestId('channel-avatar').tagName).toBe('IMG')
    expect(getByTestId('channel-avatar')).toHaveAttribute('src', 'https://img/av.jpg')
  })

  it('falls back to the channel initial when no avatar is set', () => {
    vi.mocked(useChannels).mockReturnValue({
      myChannels: [
        { id: '1', name: 'My Channel', member: { character_name: 'Hero' } } as any,
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { getByTestId } = render(<Lobby />, { wrapper: MemoryRouter })
    expect(getByTestId('channel-avatar').tagName).toBe('DIV')
    expect(getByTestId('channel-avatar')).toHaveTextContent('M')
  })

  // #674: the Discover tab.
  describe('Discover tab', () => {
    const card = {
      id: 'c1',
      name: 'Dragon Hunt',
      gm_display_name: 'Aria',
      game_system: 'shadowdark',
      description: 'A weekly game about dragons.',
      constraints: 'Be kind.',
      member_count: 4,
      last_message_at: '2026-10-01T10:00:00Z',
    }

    function mockDiscover(channels: unknown[] = [card], overrides: Record<string, unknown> = {}) {
      const loadMore = vi.fn()
      const refetch = vi.fn()
      vi.mocked(usePublicChannels).mockReturnValue({
        channels,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        refetch,
        loadMore,
        ...overrides,
      } as any)
      return { loadMore, refetch }
    }

    function withMyChannels(myChannels: unknown[]) {
      vi.mocked(useChannels).mockReturnValue({ myChannels, loading: false, error: null, refetch: vi.fn() } as any)
    }

    const oneChannel = [{ id: '1', name: 'Mine', member: { character_name: 'Hero' } }]

    it('renders both tabs', () => {
      withMyChannels(oneChannel)
      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByRole('button', { name: 'My Games' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Discover' })).toBeInTheDocument()
    })

    it('badges a channel this user GMs with its pending join requests', () => {
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
      withMyChannels([{ id: '1', name: 'Mine', gm_id: 'u1', member: { character_name: 'Hero' } }])
      vi.mocked(usePendingJoinRequestCounts).mockReturnValue({ 1: 2 })

      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByRole('img', { name: '2 pending join requests' })).toHaveTextContent('2')
    })

    it('shows no join request badge on a channel someone else GMs', () => {
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
      withMyChannels([{ id: '1', name: 'Mine', gm_id: 'someone-else', member: { character_name: 'Hero' } }])
      vi.mocked(usePendingJoinRequestCounts).mockReturnValue({ 1: 2 })

      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.queryByRole('img', { name: /pending join request/ })).not.toBeInTheDocument()
    })

    it('announces an approved application and opens the channel', () => {
      const dismiss = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useMyJoinRequestDecisions).mockReturnValue({
        decisions: [{ id: 'r1', channel_id: 'c9', channel_name: 'Sunless Citadel', status: 'approved', decided_at: '2026-10-15T10:00:00Z', is_member: true }],
        loading: false,
        error: null,
        refetch: vi.fn(),
        dismiss,
      })
      withMyChannels(oneChannel)

      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByText(/You're in/)).toBeInTheDocument()
      expect(screen.getByText('Sunless Citadel')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('link', { name: 'Open channel' }))
      expect(dismiss).toHaveBeenCalledWith('r1')
    })

    it('announces a rejection and dismisses it', () => {
      const dismiss = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useMyJoinRequestDecisions).mockReturnValue({
        decisions: [{ id: 'r2', channel_id: 'c9', channel_name: 'Sunless Citadel', status: 'rejected', decided_at: '2026-10-15T10:00:00Z' }],
        loading: false,
        error: null,
        refetch: vi.fn(),
        dismiss,
      })
      withMyChannels(oneChannel)

      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByText(/was declined/)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Open channel' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Dismiss the decision for Sunless Citadel/ }))
      expect(dismiss).toHaveBeenCalledWith('r2')
    })

    it('keeps the notice up when dismissing fails', async () => {
      const dismiss = vi.fn().mockRejectedValue(new Error('down'))
      const addToast = vi.fn()
      vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(useMyJoinRequestDecisions).mockReturnValue({
        decisions: [{ id: 'r3', channel_id: 'c9', channel_name: 'Sunless Citadel', status: 'rejected', decided_at: '2026-10-15T10:00:00Z' }],
        loading: false,
        error: null,
        refetch: vi.fn(),
        dismiss,
      })
      withMyChannels(oneChannel)

      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: /Dismiss the decision for Sunless Citadel/ }))

      await waitFor(() => expect(dismiss).toHaveBeenCalledWith('r3'))
      // A dead button would look like a bug: the failure is reported, and the
      // notice stays until the server actually stamps it.
      await waitFor(() => expect(addToast).toHaveBeenCalledWith("Couldn't dismiss that update. Please try again.", 'error'))
      expect(screen.getByText(/was declined/)).toBeInTheDocument()
    })

    it('offers a Retry when the decisions could not be loaded', () => {
      const refetch = vi.fn()
      vi.mocked(useMyJoinRequestDecisions).mockReturnValue({
        decisions: [],
        loading: false,
        error: new Error('down'),
        refetch,
        dismiss: vi.fn(),
      })
      withMyChannels(oneChannel)

      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByTestId('join-request-notice-error')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(refetch).toHaveBeenCalled()
    })

    it('defaults to My Games when the user has channels', () => {
      withMyChannels(oneChannel)
      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByRole('button', { name: 'My Games' })).toHaveAttribute('aria-current', 'page')
    })

    it('falls back to Discover when the user has no channels', () => {
      withMyChannels([])
      render(<Lobby />, { wrapper: MemoryRouter })

      expect(screen.getByRole('button', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')
      // The My Games first-run prompt stays on My Games: on Discover it sat above
      // the listings and pushed them below the fold. Onboarding is one tap away.
      expect(screen.queryByTestId('empty-lobby')).not.toBeInTheDocument()
    })

    it('keeps an explicit My Games choice for a user with no channels', () => {
      withMyChannels([])
      mockDiscover()
      render(<Lobby />, { wrapper: MemoryRouter })

      // First load falls back to Discover...
      expect(screen.getByRole('button', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')

      // ...but choosing My Games must stick, so its empty state stays reachable.
      fireEvent.click(screen.getByRole('button', { name: 'My Games' }))
      expect(screen.getByRole('button', { name: 'My Games' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByTestId('empty-lobby')).toBeInTheDocument()
    })

    it('renders discover cards with GM, description and member count', () => {
      withMyChannels(oneChannel)
      mockDiscover()
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))

      expect(screen.getByText('Dragon Hunt')).toBeInTheDocument()
      expect(screen.getByText('GM Aria')).toBeInTheDocument()
      expect(screen.getByText('A weekly game about dragons.')).toBeInTheDocument()
      expect(screen.getByText(/4 members/)).toBeInTheDocument()
    })

    it('opens the detail sheet when a card is tapped', () => {
      withMyChannels(oneChannel)
      mockDiscover()
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
      fireEvent.click(screen.getByTestId('discover-card'))

      expect(screen.getByTestId('detail-sheet')).toHaveTextContent('c1')
    })

    it('makes description links tappable without opening the sheet', () => {
      withMyChannels(oneChannel)
      mockDiscover([{ ...card, description: 'Recruiting at https://example.com/recruit.' }])
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))

      const link = screen.getByRole('link', { name: 'https://example.com/recruit' })
      expect(link).toHaveAttribute('href', 'https://example.com/recruit')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')

      // jsdom cannot navigate: cancel the default so the click is observable
      // without a "Not implemented: navigation" leak.
      link.addEventListener('click', (event) => event.preventDefault(), { once: true })
      fireEvent.click(link)

      expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument()
      // The rest of the card still opens the listing.
      expect(screen.getByTestId('discover-card')).toHaveAccessibleName('Open Dragon Hunt')

      // Only the anchors opt back into pointer events; plain description text
      // must stay transparent to clicks so the card button under it opens.
      const paragraph = link.closest('p')!
      expect(paragraph.className).toContain('[&_a]:pointer-events-auto')
      for (let element = link.parentElement; element && element !== paragraph; element = element.parentElement) {
        expect(element.className).not.toContain('pointer-events-auto')
      }
    })

    it('reads and writes the ?tab=discover URL param', () => {
      withMyChannels(oneChannel)
      render(
        <MemoryRouter initialEntries={['/?tab=discover']}>
          <Routes>
            <Route path="/" element={<Lobby />} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByRole('button', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')
      fireEvent.click(screen.getByRole('button', { name: 'My Games' }))
      expect(screen.getByRole('button', { name: 'My Games' })).toHaveAttribute('aria-current', 'page')
    })

    it('shows an empty state when nothing is listed', () => {
      withMyChannels(oneChannel)
      mockDiscover([])
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
      expect(screen.getByText('No games listed yet.')).toBeInTheDocument()
    })

    it('shows an error with a Retry that refetches Discover', () => {
      withMyChannels(oneChannel)
      const { refetch } = mockDiscover([], { error: new Error('down') })
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
      expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load games/)

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(refetch).toHaveBeenCalledTimes(1)
    })

    it('shows a spinner while Discover loads', () => {
      withMyChannels(oneChannel)
      mockDiscover([], { loading: true })
      const { container } = render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('loads more when another page exists', () => {
      withMyChannels(oneChannel)
      const { loadMore } = mockDiscover([card], { hasMore: true })
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
      expect(loadMore).toHaveBeenCalledTimes(1)
    })

    it('hides Load more on the last page', () => {
      withMyChannels(oneChannel)
      mockDiscover([card])
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    })

    it('renders a Discover search box instead of a game-system filter', () => {
      withMyChannels(oneChannel)
      mockDiscover()
      vi.mocked(usePublicChannels).mockClear()
      render(
        <MemoryRouter initialEntries={['/?tab=discover&dq=beam']}>
          <Routes>
            <Route path="/" element={<Lobby />} />
          </Routes>
        </MemoryRouter>
      )

      const input = screen.getByLabelText('Search games')
      expect(input).toHaveValue('beam')
      expect(screen.queryByLabelText('Game system')).not.toBeInTheDocument()
      expect(vi.mocked(usePublicChannels)).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'beam', enabled: true })
      )
    })

    it('drives the Discover search from its own box, not the header query', async () => {
      withMyChannels(oneChannel)
      mockDiscover()
      vi.mocked(usePublicChannels).mockClear()
      render(
        <MemoryRouter initialEntries={['/?tab=discover&q=header-only']}>
          <Routes>
            <Route path="/" element={<Lobby />} />
          </Routes>
        </MemoryRouter>
      )

      // The header's My Games query does not search the listings.
      expect(vi.mocked(usePublicChannels)).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '' })
      )

      fireEvent.change(screen.getByLabelText('Search games'), { target: { value: 'dragon' } })

      // Debounced: the param (and so the RPC) waits for the typing to settle.
      await waitFor(
        () =>
          expect(vi.mocked(usePublicChannels)).toHaveBeenLastCalledWith(
            expect.objectContaining({ search: 'dragon' })
          ),
        { timeout: 2000 }
      )
    })

    it('adopts an external ?dq change and drops the pending write', async () => {
      withMyChannels(oneChannel)
      mockDiscover()
      vi.mocked(usePublicChannels).mockClear()

      // A second entry point into the lobby (back/forward, a deep link) that
      // changes ?dq behind the search box's back.
      function NavigationHarness() {
        const navigate = useNavigate()
        const [params] = useSearchParams()
        return (
          <>
            <button type="button" onClick={() => navigate('/?tab=discover&dq=beam')}>
              external-nav
            </button>
            <span data-testid="dq-param">{params.get('dq') ?? ''}</span>
            <Lobby />
          </>
        )
      }

      render(
        <MemoryRouter initialEntries={['/?tab=discover']}>
          <Routes>
            <Route path="/" element={<NavigationHarness />} />
          </Routes>
        </MemoryRouter>
      )

      fireEvent.change(screen.getByLabelText('Search games'), { target: { value: 'drag' } })
      expect(screen.getByLabelText('Search games')).toHaveValue('drag')

      fireEvent.click(screen.getByRole('button', { name: 'external-nav' }))

      // The box adopts the navigation...
      await waitFor(() => expect(screen.getByLabelText('Search games')).toHaveValue('beam'))
      // ...and the query follows it, not the abandoned text.
      expect(vi.mocked(usePublicChannels)).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'beam' })
      )

      // The write still pending for 'drag' must not land after its debounce.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
      })
      expect(screen.getByTestId('dq-param')).toHaveTextContent('beam')
      expect(screen.getByLabelText('Search games')).toHaveValue('beam')
    })

    it('does not query Discover while My Games is active', () => {
      withMyChannels(oneChannel)
      mockDiscover()
      render(<Lobby />, { wrapper: MemoryRouter })

      expect(vi.mocked(usePublicChannels)).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false })
      )
    })

    it('fires lobby_tab_view for the active tab', () => {
      withMyChannels([])
      mockDiscover()
      render(<Lobby />, { wrapper: MemoryRouter })

      expect(trackEvent).toHaveBeenCalledWith('lobby_tab_view', { tab: 'discover' })
    })

    it('does not log a phantom My Games view while the channel list is loading', () => {
      vi.mocked(useChannels).mockReturnValue({ myChannels: [], loading: true, error: null, refetch: vi.fn() } as any)
      mockDiscover()

      const { rerender } = render(<Lobby />, { wrapper: MemoryRouter })
      // The tab is undecided until My Games settles, so nothing is logged yet.
      expect(trackEvent).not.toHaveBeenCalled()

      withMyChannels([])
      rerender(<Lobby />)

      expect(trackEvent).toHaveBeenCalledWith('lobby_tab_view', { tab: 'discover' })
      expect(trackEvent).not.toHaveBeenCalledWith('lobby_tab_view', { tab: 'my' })
    })

    it('distinguishes an empty Discover from a search with no matches', () => {
      withMyChannels(oneChannel)
      mockDiscover([])
      const { unmount } = render(
        <MemoryRouter initialEntries={['/?tab=discover&dq=zzz']}>
          <Routes>
            <Route path="/" element={<Lobby />} />
          </Routes>
        </MemoryRouter>
      )
      expect(screen.getByText('No matching games found.')).toBeInTheDocument()
      unmount()

      mockDiscover([])
      render(
        <MemoryRouter initialEntries={['/?tab=discover']}>
          <Routes>
            <Route path="/" element={<Lobby />} />
          </Routes>
        </MemoryRouter>
      )
      expect(screen.getByText('No games listed yet.')).toBeInTheDocument()
    })

    it('keeps the cards and shows an inline row when Load more fails', () => {
      withMyChannels(oneChannel)
      const { loadMore } = mockDiscover([card], { hasMore: true, loadMoreError: new Error('down') })
      render(<Lobby />, { wrapper: MemoryRouter })

      fireEvent.click(screen.getByRole('button', { name: 'Discover' }))

      // A failed page must not blank the list that is already on screen.
      expect(screen.getByText('Dragon Hunt')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load more/)

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(loadMore).toHaveBeenCalledTimes(1)
    })
  })
})
