import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UserDetailModal } from './UserDetailModal'
import type { AdminUser, AdminMessage } from './useAdminData'

const user: AdminUser = {
  id: 'u1',
  display_name: 'Bob',
  email: 'bob@example.com',
  channel_count: 1,
  channels: [],
  last_login_at: '2026-03-01T00:00:00Z',
  last_message_at: '2026-03-02T00:00:00Z',
  message_count: 3,
  created_at: '2026-01-01T00:00:00Z',
  is_suspended: false,
  avatar_url: null,
  server_admin: false,
  email_verified: true,
  provider: 'google',
  email_opt_in: false,
}

const renderModal = (over: Partial<Parameters<typeof UserDetailModal>[0]> = {}) =>
  render(
    <UserDetailModal
      user={user}
      onClose={vi.fn()}
      onSuspend={vi.fn()}
      getUserHistory={vi.fn().mockResolvedValue([])}
      listUserMessages={vi.fn().mockResolvedValue([])}
      {...over}
    />
  )

const makeMessages = (count: number, prefix: string): AdminMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    channel_id: 'c1',
    channel_name: 'Curse of Strahd',
    content: `${prefix} message ${i}`,
    type: 'regular',
    is_deleted: false,
    created_at: `2026-03-01T00:${String(i).padStart(2, '0')}:00Z`,
  }))

describe('UserDetailModal', () => {
  it('renders the message history for investigation', async () => {
    const messages: AdminMessage[] = [{
      id: 'm1',
      channel_id: 'c1',
      channel_name: 'Curse of Strahd',
      content: 'a reported line',
      type: 'regular',
      is_deleted: false,
      created_at: '2026-03-02T00:00:00Z',
    }]

    renderModal({ listUserMessages: vi.fn().mockResolvedValue(messages) })

    expect(await screen.findByText('a reported line')).toBeInTheDocument()
    expect(screen.getByText('Message history')).toBeInTheDocument()
  })

  it('shows the empty state when the user has no messages', async () => {
    renderModal()

    expect(await screen.findByText('No messages found.')).toBeInTheDocument()
  })

  it('keeps the modal usable when the message history fails to load', async () => {
    renderModal({ listUserMessages: vi.fn().mockResolvedValue('Failed to load message history.') })

    expect(await screen.findByText('Failed to load message history.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
  })

  it('labels a soft-deleted message', async () => {
    const messages: AdminMessage[] = [{
      id: 'm2',
      channel_id: 'c1',
      channel_name: 'Curse of Strahd',
      content: 'removed words',
      type: 'regular',
      is_deleted: true,
      created_at: '2026-03-02T00:00:00Z',
    }]

    renderModal({ listUserMessages: vi.fn().mockResolvedValue(messages) })

    expect(await screen.findByText('removed words')).toBeInTheDocument()
    expect(screen.getByText(/deleted/)).toBeInTheDocument()
  })

  it('labels a CSAM block rather than calling it unsuspended', async () => {
    renderModal({
      getUserHistory: vi.fn().mockResolvedValue([
        { id: 'a1', action: 'csam_match_blocked', reason: null, admin_name: null, created_at: '2026-03-02T00:00:00Z' },
      ]),
    })

    expect(await screen.findByText('Upload blocked and account suspended')).toBeInTheDocument()
    expect(screen.queryByText('Unsuspended')).not.toBeInTheDocument()
  })

  it('labels read-audit actions', async () => {
    renderModal({
      getUserHistory: vi.fn().mockResolvedValue([
        { id: 'a2', action: 'read_message', reason: null, admin_name: null, created_at: '2026-03-02T00:00:00Z' },
      ]),
    })

    expect(await screen.findByText('Viewed a reported message')).toBeInTheDocument()
  })

  it('falls back to the raw action name for unknown actions', async () => {
    renderModal({
      getUserHistory: vi.fn().mockResolvedValue([
        { id: 'a3', action: 'some_future_action', reason: null, admin_name: null, created_at: '2026-03-02T00:00:00Z' },
      ]),
    })

    expect(await screen.findByText('some_future_action')).toBeInTheDocument()
  })

  it('loads older messages when a full page is shown', async () => {
    const firstPage: AdminMessage[] = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`,
      channel_id: 'c1',
      channel_name: 'Curse of Strahd',
      content: `message ${i}`,
      type: 'regular',
      is_deleted: false,
      created_at: `2026-03-01T00:${String(i).padStart(2, '0')}:00Z`,
    }))
    const older: AdminMessage[] = [{
      id: 'old1',
      channel_id: 'c1',
      channel_name: 'Curse of Strahd',
      content: 'an older message',
      type: 'regular',
      is_deleted: false,
      created_at: '2026-01-01T00:00:00Z',
    }]
    const listUserMessages = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(older)

    renderModal({ listUserMessages })

    fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }))

    expect(await screen.findByText('an older message')).toBeInTheDocument()
    expect(listUserMessages).toHaveBeenLastCalledWith('u1', {
      before: expect.any(String),
      beforeId: expect.any(String),
      limit: 50,
    })
  })

  it('keeps the paging control after a second full page', async () => {
    const listUserMessages = vi.fn()
      .mockResolvedValueOnce(makeMessages(50, 'a'))
      .mockResolvedValueOnce(makeMessages(50, 'b'))

    renderModal({ listUserMessages })

    fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }))

    expect(await screen.findByText('b message 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load older messages' })).toBeInTheDocument()
  })

  it('keeps the loaded list when loading older messages fails', async () => {
    const listUserMessages = vi.fn()
      .mockResolvedValueOnce(makeMessages(50, 'a'))
      .mockResolvedValueOnce('Failed to load message history.')

    renderModal({ listUserMessages })

    fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }))

    expect(await screen.findByText('Failed to load message history.')).toBeInTheDocument()
    expect(screen.getByText('a message 0')).toBeInTheDocument()
  })

  it('hides the older-messages control when the first page is not full', async () => {
    renderModal({
      listUserMessages: vi.fn().mockResolvedValue([{
        id: 'm1',
        channel_id: 'c1',
        channel_name: 'Curse of Strahd',
        content: 'a reported line',
        type: 'regular',
        is_deleted: false,
        created_at: '2026-03-02T00:00:00Z',
      }]),
    })

    expect(await screen.findByText('a reported line')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load older messages' })).not.toBeInTheDocument()
  })
})
