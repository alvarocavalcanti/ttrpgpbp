import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThreadDetail } from './ThreadDetail'
import type { Thread } from './types'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useAdminMessages } from './useAdminMessages'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

vi.mock('./useAdminMessages', () => ({
  useAdminMessages: vi.fn()
}))

const mockThread: Thread = {
  id: 'thread-1',
  type: 'announcement',
  subject: 'Test Announcement',
  gm_id: null,
  created_by: 'user-admin',
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  creator: { display_name: 'Admin', avatar_url: null },
  gm: undefined,
  unread: true
}

describe('ThreadDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-admin' } } as any)
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [], loading: false } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
  })

  it('calls mark_admin_thread_read when thread is opened', async () => {
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_thread_read', { p_thread_id: 'thread-1' })
    })
  })

  it('calls mark_admin_thread_read again when new messages arrive', async () => {
    const { rerender } = render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    vi.mocked(useAdminMessages).mockReturnValue({
      messages: [{ id: 'msg-1', content: 'Hello', sender_id: 'user-admin', thread_id: 'thread-1', created_at: new Date().toISOString(), is_deleted: false, sender: { display_name: 'Admin', avatar_url: null } }],
      loading: false
    } as any)

    rerender(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledTimes(2)
    })
  })
})
