import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThreadDetail } from './ThreadDetail'
import type { Thread, Message } from './types'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useAdminMessages } from './useAdminMessages'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
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

const mockMessage: Message = {
  id: 'msg-1',
  content: 'Hello world',
  sender_id: 'user-admin',
  thread_id: 'thread-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_deleted: false,
  sender: { display_name: 'Admin', avatar_url: null }
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

  it('subscribes to mark_admin_thread_read when thread is opened', async () => {
    const thenable = { then: vi.fn(() => thenable), catch: vi.fn(() => thenable) }
    vi.mocked(supabase.rpc).mockReturnValue(thenable as any)

    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_thread_read', { p_thread_id: 'thread-1' })
    // The supabase-js v2 RPC returns a lazy thenable; it only fires the HTTP
    // request when subscribed. Asserting `.then` was invoked catches a regression
    // where the promise is discarded (e.g. `void supabase.rpc(...)`) and never runs.
    expect(thenable.then).toHaveBeenCalled()
  })

  it('subscribes to mark_admin_thread_read again when new messages arrive', async () => {
    const thenable = { then: vi.fn(() => thenable), catch: vi.fn(() => thenable) }
    vi.mocked(supabase.rpc).mockReturnValue(thenable as any)

    const { rerender } = render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(thenable.then).toHaveBeenCalledTimes(1)

    vi.mocked(useAdminMessages).mockReturnValue({ messages: [mockMessage], loading: false } as any)
    rerender(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(thenable.then).toHaveBeenCalledTimes(2)
  })

  it('shows loading state', () => {
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [], loading: true } as any)
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders messages', () => {
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [mockMessage], loading: false } as any)
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('calls loadMore when Load earlier messages is clicked', () => {
    const loadMore = vi.fn()
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [mockMessage], loading: false, hasMore: true, loadMore } as any)
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Load earlier messages'))
    expect(loadMore).toHaveBeenCalled()
  })

  it('shows error banner and retries via refetch', () => {
    const refetch = vi.fn()
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [], loading: false, error: new Error('boom'), refetch } as any)
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText("Couldn't load messages.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
  })

  it('renders deleted message placeholder', () => {
    const deleted: Message = { ...mockMessage, is_deleted: true, content: '' }
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [deleted], loading: false } as any)
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('[Message deleted]')).toBeInTheDocument()
  })

  it('shows announcement title for announcement thread', () => {
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('Test Announcement')).toBeInTheDocument()
  })

  it('shows DM title for non-admin viewing DM', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    const dmThread: Thread = { ...mockThread, type: 'dm', subject: null, gm_id: 'gm-1', gm: { display_name: 'GM Bob', avatar_url: null } }
    render(<ThreadDetail thread={dmThread} onBack={vi.fn()} />)
    expect(screen.getByText('Server Admin')).toBeInTheDocument()
  })

  it('shows GM name for admin viewing DM', () => {
    const dmThread: Thread = { ...mockThread, type: 'dm', subject: null, gm_id: 'gm-1', gm: { display_name: 'GM Bob', avatar_url: null } }
    render(<ThreadDetail thread={dmThread} onBack={vi.fn()} />)
    expect(screen.getByText('GM Bob')).toBeInTheDocument()
  })

  it('sends reply on form submit', async () => {
    const insertChain: any = { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
    vi.mocked(supabase.from).mockReturnValue(insertChain)

    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    const textarea = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(textarea, { target: { value: 'My reply' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('admin_messages')
    })
  })

  it('shows alert on reply failure', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const insertChain: any = { insert: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) }
    vi.mocked(supabase.from).mockReturnValue(insertChain)

    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    const textarea = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(textarea, { target: { value: 'My reply' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to send reply')
    })
    alertSpy.mockRestore()
  })

  it('shows delete thread button for server admin', () => {
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByTitle('Delete Thread')).toBeInTheDocument()
  })

  it('deletes thread on confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onBack = vi.fn()
    const deleteChain: any = { delete: () => deleteChain, eq: vi.fn().mockResolvedValue({ error: null }) }
    vi.mocked(supabase.from).mockReturnValue(deleteChain)

    render(<ThreadDetail thread={mockThread} onBack={onBack} />)
    fireEvent.click(screen.getByTitle('Delete Thread'))

    await waitFor(() => {
      expect(onBack).toHaveBeenCalled()
    })
    vi.spyOn(window, 'confirm').mockRestore()
  })

  it('does not delete thread when confirm cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onBack = vi.fn()

    render(<ThreadDetail thread={mockThread} onBack={onBack} />)
    fireEvent.click(screen.getByTitle('Delete Thread'))

    expect(onBack).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockRestore()
  })

  it('shows delete message button for own message', () => {
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [mockMessage], loading: false } as any)
    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('deletes a message on confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(useAdminMessages).mockReturnValue({ messages: [mockMessage], loading: false } as any)
    const updateChain: any = { update: () => updateChain, eq: vi.fn().mockResolvedValue({ error: null }) }
    vi.mocked(supabase.from).mockReturnValue(updateChain)

    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('admin_messages')
    })
    vi.spyOn(window, 'confirm').mockRestore()
  })
})

  it('sends reply on Enter key (not Shift+Enter)', async () => {
    const insertChain: any = { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
    vi.mocked(supabase.from).mockReturnValue(insertChain)

    render(<ThreadDetail thread={mockThread} onBack={vi.fn()} />)

    const textarea = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(textarea, { target: { value: 'Quick reply' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('admin_messages')
    })
  })
