import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThreadList } from './ThreadList'
import { useAdminThreads } from './useAdminThreads'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { supabase } from '../../lib/supabase'

vi.mock('./useAdminThreads', () => ({
  useAdminThreads: vi.fn()
}))

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}))

function makeThreadChain(threadId: string) {
  const chain: any = {
    insert: () => chain,
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve({
      data: {
        id: threadId, type: 'announcement', subject: 'Test', gm_id: null,
        created_by: 'admin-1', last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        creator: { display_name: 'Admin', avatar_url: null }
      },
      error: null
    })
  }
  return chain
}

describe('ThreadList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAdminThreads).mockReturnValue({ threads: [], loading: false } as any)
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'admin-1' } } } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
  })

  it('shows empty state when no threads', () => {
    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('No messages yet.')).toBeInTheDocument()
  })

  it('shows thread list when threads exist', () => {
    vi.mocked(useAdminThreads).mockReturnValue({
      threads: [{
        id: 't-1', type: 'announcement', subject: 'Hello', gm_id: null,
        created_by: 'admin-1', last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        creator: { display_name: 'Admin', avatar_url: null },
        unread: false
      }],
      loading: false
    } as any)

    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('Announcement')).toBeInTheDocument()
  })

  it('calls loadMore when Load more is clicked', () => {
    const loadMore = vi.fn()
    vi.mocked(useAdminThreads).mockReturnValue({
      threads: [{
        id: 't-1', type: 'announcement', subject: 'Hello', gm_id: null,
        created_by: 'admin-1', last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        creator: { display_name: 'Admin', avatar_url: null },
        unread: false
      }],
      loading: false,
      hasMore: true,
      loadMore
    } as any)

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('Load more'))
    expect(loadMore).toHaveBeenCalled()
  })

  it('shows error banner and retries via refetch', () => {
    const refetch = vi.fn()
    vi.mocked(useAdminThreads).mockReturnValue({
      threads: [],
      loading: false,
      error: new Error('boom'),
      refetch
    } as any)

    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText("Couldn't load conversations.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
  })

  it('calls mark_admin_thread_read after creating announcement', async () => {
    const threadId = 'new-thread-id'
    const onSelectThread = vi.fn()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'admin_threads') return makeThreadChain(threadId) as any
      if (table === 'admin_messages') {
        const msgChain: any = { insert: () => Promise.resolve({ data: null, error: null }) }
        return msgChain
      }
      return {} as any
    })

    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === 'admin_list_active_gms') return Promise.resolve({ data: [], error: null }) as any
      return Promise.resolve({ data: null, error: null }) as any
    })

    render(<ThreadList onSelectThread={onSelectThread} />)

    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_thread_read', { p_thread_id: threadId })
    })
  })

  it('logs error when mark_admin_thread_read fails after thread creation', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const threadId = 'new-thread-id'

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'admin_threads') return makeThreadChain(threadId) as any
      if (table === 'admin_messages') {
        const msgChain: any = { insert: () => Promise.resolve({ data: null, error: null }) }
        return msgChain
      }
      return {} as any
    })

    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === 'admin_list_active_gms') return Promise.resolve({ data: [], error: null }) as any
      if (fn === 'mark_admin_thread_read') return Promise.resolve({ data: null, error: { message: 'RPC failed' } }) as any
      return Promise.resolve({ data: null, error: null }) as any
    })

    render(<ThreadList onSelectThread={vi.fn()} />)

    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to mark new thread as read:', expect.anything())
    })

    consoleSpy.mockRestore()
  })
})

describe('NewThreadModal additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAdminThreads).mockReturnValue({ threads: [], loading: false } as any)
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'admin-1' } } } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
  })

  it('alerts on message insert failure', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const threadId = 'new-thread-id'

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'admin_threads') return makeThreadChain(threadId) as any
      if (table === 'admin_messages') {
        const msgChain: any = { insert: () => Promise.resolve({ data: null, error: { message: 'fail' } }) }
        return msgChain
      }
      return {} as any
    })

    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === 'admin_list_active_gms') return Promise.resolve({ data: [], error: null }) as any
      return Promise.resolve({ data: null, error: null }) as any
    })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Subj' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to send message')
    })
    alertSpy.mockRestore()
  })

  it('shows GM dropdown when type switched to dm', async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === 'admin_list_active_gms') return Promise.resolve({ data: [{ id: 'gm-1', display_name: 'GM Alice' }], error: null }) as any
      return Promise.resolve({ data: null, error: null }) as any
    })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => {
      expect(screen.getByText('GM Alice')).toBeInTheDocument()
    })
  })
})

describe('ThreadList non-admin and interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAdminThreads).mockReturnValue({ threads: [], loading: false } as any)
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'gm-1' } } } as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)
  })

  it('shows Message Admin button for non-admin', () => {
    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('Message Admin')).toBeInTheDocument()
  })

  it('calls onSelectThread when thread is clicked', () => {
    const thread = {
      id: 't-1', type: 'announcement', subject: 'Hello', gm_id: null,
      created_by: 'admin-1', last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      creator: { display_name: 'Admin', avatar_url: null },
      unread: false
    }
    vi.mocked(useAdminThreads).mockReturnValue({ threads: [thread], loading: false } as any)
    const onSelectThread = vi.fn()
    render(<ThreadList onSelectThread={onSelectThread} />)
    fireEvent.click(screen.getByText('Announcement'))
    expect(onSelectThread).toHaveBeenCalledWith(thread)
  })

  it('alerts on thread creation failure', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'admin_threads') {
        const chain: any = {
          insert: () => chain,
          select: () => chain,
          eq: () => chain,
          single: () => Promise.resolve({ data: null, error: { message: 'fail' } })
        }
        return chain as any
      }
      return {} as any
    })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('Message Admin'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Body text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to create thread')
    })
    alertSpy.mockRestore()
  })

  it('selects GM from dropdown when type is dm', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })

    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === 'admin_list_active_gms') return Promise.resolve({ data: [{ id: 'gm-1', display_name: 'GM Alice' }], error: null }) as any
      return Promise.resolve({ data: null, error: null }) as any
    })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    // Switch to DM type
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => screen.getByText('GM Alice'))

    // Select the GM
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'gm-1' } })
    expect(screen.getByText('GM Alice')).toBeInTheDocument()
  })
})
