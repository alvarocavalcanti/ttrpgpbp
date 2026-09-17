import { render, screen } from '@testing-library/react'
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
})
