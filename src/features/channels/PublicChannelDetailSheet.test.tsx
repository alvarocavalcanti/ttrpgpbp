import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PublicChannelDetailSheet } from './PublicChannelDetailSheet'
import { usePublicChannelApply } from './usePublicChannelApply'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'

vi.mock('./usePublicChannelApply', () => ({
  usePublicChannelApply: vi.fn(),
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

const detail = {
  id: 'c1',
  name: 'Listed Game',
  gm_display_name: 'Aria',
  game_system: 'shadowdark',
  description: 'A weekly game.',
  constraints: 'Be kind; post most days.',
  member_count: 4,
  last_message_at: null,
  application_prompt: 'Why do you want to join?',
  is_member: false,
  pending_request_id: null as string | null,
}

function mockApply(overrides: Record<string, unknown> = {}) {
  const apply = vi.fn().mockResolvedValue(undefined)
  const withdraw = vi.fn().mockResolvedValue(undefined)
  vi.mocked(usePublicChannelApply).mockReturnValue({
    detail,
    loading: false,
    error: null,
    busy: false,
    refetch: vi.fn(),
    apply,
    withdraw,
    ...overrides,
  } as any)
  return { apply, withdraw }
}

function renderSheet() {
  return render(
    <MemoryRouter>
      <PublicChannelDetailSheet channelId="c1" gameSystem="shadowdark" onClose={vi.fn()} />
    </MemoryRouter>,
  )
}

describe('PublicChannelDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() } as any)
  })

  it('renders a spinner while the listing loads', () => {
    mockApply({ loading: true, detail: null })

    const { container } = renderSheet()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders an error state with a Retry that refetches', () => {
    const refetch = vi.fn()
    mockApply({ error: new Error('nope'), detail: null, refetch })

    renderSheet()
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load this listing/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the listing copy, GM, member count, and the prompt', () => {
    mockApply()

    renderSheet()
    expect(screen.getByText('A weekly game.')).toBeInTheDocument()
    expect(screen.getByText('Be kind; post most days.')).toBeInTheDocument()
    expect(screen.getByText(/Run by Aria/)).toBeInTheDocument()
    expect(screen.getByText(/4 members/)).toBeInTheDocument()
    expect(screen.getByText('Why do you want to join?')).toBeInTheDocument()
  })

  it('renders GM-authored copy as text, never HTML', () => {
    mockApply({ detail: { ...detail, description: '<b>not bold</b>' } })

    const { container } = renderSheet()
    expect(screen.getByText('<b>not bold</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })

  it('fires listing_open once on open', () => {
    mockApply()

    renderSheet()
    expect(trackEvent).toHaveBeenCalledWith('listing_open', { game_system: 'shadowdark' })
  })

  it('applies with the character name and answer and fires listing_apply_submit', async () => {
    const { apply } = mockApply()

    renderSheet()
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Aria' } })
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'hello' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Apply to join' }).closest('form')!)

    await waitFor(() => expect(apply).toHaveBeenCalledWith('Aria', 'hello'))
    expect(trackEvent).toHaveBeenCalledWith('listing_apply_submit', { game_system: 'shadowdark' })
  })

  it('disables Apply until a character name is entered', () => {
    mockApply()

    renderSheet()
    expect(screen.getByRole('button', { name: 'Apply to join' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Aria' } })
    expect(screen.getByRole('button', { name: 'Apply to join' })).not.toBeDisabled()
  })

  it('caps the character name at 20 and the answer at 1000', () => {
    mockApply()

    renderSheet()
    expect(screen.getByLabelText('Character name')).toHaveAttribute('maxlength', '20')
    expect(screen.getByLabelText('Your answer')).toHaveAttribute('maxlength', '1000')
  })

  it('shows the server message when an application is rejected', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    // rpc() rejects with a plain PostgrestError object, not an Error instance.
    const apply = vi.fn().mockRejectedValue({ message: 'You already have a pending application for this channel.' })
    mockApply({ apply })

    renderSheet()
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Aria' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Apply to join' }).closest('form')!)

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith('You already have a pending application for this channel.', 'error'),
    )
  })

  it('shows the server message when a withdrawal is rejected', async () => {
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    const withdraw = vi.fn().mockRejectedValue({ message: 'That application is no longer pending.' })
    mockApply({ detail: { ...detail, pending_request_id: 'req-1' }, withdraw })

    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw application' }))

    await waitFor(() => expect(addToast).toHaveBeenCalledWith('That application is no longer pending.', 'error'))
  })

  it('omits the copy sections when the GM left them blank', () => {
    mockApply({ detail: { ...detail, description: null, constraints: null } })

    renderSheet()
    expect(screen.queryByText('About this game')).not.toBeInTheDocument()
    expect(screen.queryByText('What the GM expects')).not.toBeInTheDocument()
  })

  it('shows a pending state with a Withdraw action', async () => {
    const { withdraw } = mockApply({ detail: { ...detail, pending_request_id: 'req-1' } })

    renderSheet()
    expect(screen.getByText(/waiting for the GM/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw application' }))
    await waitFor(() => expect(withdraw).toHaveBeenCalledWith('req-1'))
  })

  it('shows an Open channel link for a member', () => {
    mockApply({ detail: { ...detail, is_member: true } })

    renderSheet()
    const link = screen.getByRole('link', { name: 'Open channel' })
    expect(link).toHaveAttribute('href', '/channel/c1')
    // A member gets no apply form.
    expect(screen.queryByLabelText('Character name')).not.toBeInTheDocument()
  })

  describe('report a listing (#674)', () => {
    it('offers reporting to a non-member and submits the reason', async () => {
      const addToast = vi.fn()
      vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)
      mockApply()

      renderSheet()
      fireEvent.click(screen.getByRole('button', { name: 'Report this listing' }))
      fireEvent.change(screen.getByLabelText('Why are you reporting this listing?'), {
        target: { value: 'Recruiting for a paid game' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

      await waitFor(() =>
        expect(supabase.rpc).toHaveBeenCalledWith('report_channel_listing', {
          p_channel_id: 'c1',
          p_reason: 'Recruiting for a paid game',
        }),
      )
      expect(addToast).toHaveBeenCalledWith('Thanks — the report is with the moderators.', 'success')
      // The prompt closes on success.
      await waitFor(() =>
        expect(screen.queryByLabelText('Why are you reporting this listing?')).not.toBeInTheDocument(),
      )
    })

    it('caps the reason at input, matching the server', () => {
      mockApply()

      renderSheet()
      fireEvent.click(screen.getByRole('button', { name: 'Report this listing' }))

      expect(screen.getByLabelText('Why are you reporting this listing?')).toHaveAttribute('maxlength', '500')
    })

    it('surfaces the server message when the report is refused', async () => {
      const addToast = vi.fn()
      vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
      vi.mocked(supabase.rpc).mockResolvedValue({
        error: { message: 'A report for this listing is already open.' },
      } as any)
      mockApply()

      renderSheet()
      fireEvent.click(screen.getByRole('button', { name: 'Report this listing' }))
      fireEvent.change(screen.getByLabelText('Why are you reporting this listing?'), {
        target: { value: 'again' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

      await waitFor(() =>
        expect(addToast).toHaveBeenCalledWith('A report for this listing is already open.', 'error'),
      )
    })

    it('does not offer reporting to a member', () => {
      mockApply({ detail: { ...detail, is_member: true } })

      renderSheet()
      expect(screen.queryByRole('button', { name: 'Report this listing' })).not.toBeInTheDocument()
    })

    it('ignores a second submit while the first is still in flight', async () => {
      let resolveReport!: (value: { error: null }) => void
      const pending = new Promise<{ error: null }>((resolve) => {
        resolveReport = resolve
      })
      vi.mocked(supabase.rpc).mockReturnValue(pending as any)
      mockApply()

      renderSheet()
      fireEvent.click(screen.getByRole('button', { name: 'Report this listing' }))
      fireEvent.change(screen.getByLabelText('Why are you reporting this listing?'), {
        target: { value: 'spam' },
      })
      const submit = screen.getByRole('button', { name: 'Submit report' })
      fireEvent.click(submit)
      fireEvent.click(submit)

      await act(async () => {
        resolveReport({ error: null })
        await pending
      })

      // One round-trip, not two: the second would come back refused as a
      // duplicate and confuse the reporter.
      expect(supabase.rpc).toHaveBeenCalledTimes(1)
    })

    it('refuses a blank reason without a round-trip', () => {
      const addToast = vi.fn()
      vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
      mockApply()

      renderSheet()
      fireEvent.click(screen.getByRole('button', { name: 'Report this listing' }))
      fireEvent.change(screen.getByLabelText('Why are you reporting this listing?'), {
        target: { value: '   ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

      expect(supabase.rpc).not.toHaveBeenCalled()
      expect(addToast).toHaveBeenCalledWith('Enter a reason.', 'error')
    })
  })
})
