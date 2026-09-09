import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThreadList } from './ThreadList'
import { useAdminThreads } from './useAdminThreads'
import { useMessageRecipients } from './useMessageRecipients'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useToast } from '../../contexts/ToastContext'
import type { Thread } from './types'

vi.mock('./useAdminThreads', () => ({
  useAdminThreads: vi.fn()
}))

vi.mock('./useMessageRecipients', () => ({
  useMessageRecipients: vi.fn()
}))

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() }),
}))

const mockThread: Thread = {
  id: 't-1', type: 'announcement', subject: 'Hello', gm_id: null,
  audience: 'gms',
  created_by: 'admin-1', last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  creator: { display_name: 'Admin', avatar_url: null },
  unread: false
}

function mockHookReturn(overrides: Record<string, unknown> = {}) {
  vi.mocked(useAdminThreads).mockReturnValue({
    threads: [], loading: false, hasMore: false, loadMore: vi.fn(),
    refetch: vi.fn(), error: null, createThread: vi.fn(), deleteThread: vi.fn(),
    ...overrides
  } as any)
}

function mockRecipients(overrides: Record<string, unknown> = {}) {
  vi.mocked(useMessageRecipients).mockReturnValue({
    recipients: [], loading: false, error: null, refetch: vi.fn(),
    ...overrides
  } as any)
}

describe('ThreadList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockRecipients()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
  })

  it('shows empty state when no threads', () => {
    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('No messages yet.')).toBeInTheDocument()
  })

  it('shows a spinner during initial load', () => {
    mockHookReturn({ loading: true })

    const { container } = render(<ThreadList onSelectThread={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows an inline spinner while refetching with existing threads', () => {
    mockHookReturn({ threads: [mockThread], loading: true })

    const { container } = render(<ThreadList onSelectThread={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.getByText('Announcement')).toBeInTheDocument()
  })

  it('shows a spinner in the load-more button while loading more', () => {
    mockHookReturn({ threads: [mockThread], loading: true, hasMore: true })

    render(<ThreadList onSelectThread={vi.fn()} />)
    const loadMoreButton = screen.getByRole('button', { name: 'Loading...' })
    expect(loadMoreButton.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows thread list when threads exist', () => {
    mockHookReturn({ threads: [mockThread] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('Announcement')).toBeInTheDocument()
  })

  it('shows a GMs audience chip on announcement rows', () => {
    mockHookReturn({ threads: [mockThread] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('GMs')).toBeInTheDocument()
  })

  it('shows an All users audience chip for an all-users announcement', () => {
    mockHookReturn({ threads: [{ ...mockThread, audience: 'all_users' }] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('All users')).toBeInTheDocument()
  })

  it('calls loadMore when Load more is clicked', () => {
    const loadMore = vi.fn()
    mockHookReturn({ threads: [mockThread], hasMore: true, loadMore })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('Load more'))
    expect(loadMore).toHaveBeenCalled()
  })

  it('shows error banner and retries via refetch', () => {
    const refetch = vi.fn()
    mockHookReturn({ error: new Error('boom'), refetch })

    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText("Couldn't load conversations.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
  })

  it('selects the created thread via createThread and closes the modal', async () => {
    const onSelectThread = vi.fn()
    const createThread = vi.fn().mockResolvedValue(mockThread)
    mockHookReturn({ createThread })

    render(<ThreadList onSelectThread={onSelectThread} />)

    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(createThread).toHaveBeenCalledWith({
        type: 'announcement', subject: 'My Announcement', content: 'Hello world',
        audience: 'gms', gmId: null
      })
    })
    expect(onSelectThread).toHaveBeenCalledWith(mockThread)
    await waitFor(() => {
      expect(screen.queryByText('New Message')).not.toBeInTheDocument()
    })
  })

  it('keeps the modal open without selecting when creation fails (hook toasts)', async () => {
    const onSelectThread = vi.fn()
    const createThread = vi.fn().mockResolvedValue(null)
    mockHookReturn({ createThread })

    render(<ThreadList onSelectThread={onSelectThread} />)

    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(createThread).toHaveBeenCalled()
    })
    expect(onSelectThread).not.toHaveBeenCalled()
    expect(screen.getByText('New Message')).toBeInTheDocument()
  })

  it('shows a recipient list error with retry in the modal', async () => {
    const refetchRecipients = vi.fn()
    mockRecipients({ error: new Error('boom'), refetch: refetchRecipients })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    // The recipient picker only exists for DMs.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    expect(screen.getByText("Couldn't load the recipient list.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetchRecipients).toHaveBeenCalled()
  })

  it('shows a loading placeholder in the recipient picker while users load', async () => {
    mockRecipients({ loading: true })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    expect(screen.getByText('Loading users...')).toBeInTheDocument()
  })

  it('offers the audience select for admin announcements with GMs as the default', async () => {
    const createThread = vi.fn().mockResolvedValue(mockThread)
    mockHookReturn({ createThread })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    // Two comboboxes for an admin announcement: Type, then Audience.
    expect(screen.getByText('Audience')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox').length).toBe(2)

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(createThread).toHaveBeenCalledWith(
        expect.objectContaining({ audience: 'gms', type: 'announcement' })
      )
    })
  })

  it('passes an All users audience through to createThread', async () => {
    const createThread = vi.fn().mockResolvedValue(mockThread)
    mockHookReturn({ createThread })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'all_users' } })
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(createThread).toHaveBeenCalledWith(
        expect.objectContaining({ audience: 'all_users', type: 'announcement' })
      )
    })
  })
})

describe('NewThreadModal additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockRecipients()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
  })

  it('passes the selected recipient for an admin-started dm', async () => {
    const createThread = vi.fn().mockResolvedValue(mockThread)
    mockHookReturn({ createThread })
    mockRecipients({ recipients: [{ id: 'gm-1', display_name: 'GM Alice', avatar_url: null }] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => screen.getByText('GM Alice'))
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'gm-1' } })
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      // DMs carry no subject; the modal forwards '' and the hook nulls it.
      expect(createThread).toHaveBeenCalledWith({
        type: 'dm', subject: '', content: 'Body',
        audience: null, gmId: 'gm-1'
      })
    })
  })

  it('shows the recipient dropdown when type switched to dm', async () => {
    mockRecipients({ recipients: [{ id: 'gm-1', display_name: 'GM Alice', avatar_url: null }] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => {
      expect(screen.getByText('GM Alice')).toBeInTheDocument()
    })
  })

  it('disables Send for an admin dm while the recipient list errored', async () => {
    mockRecipients({ error: new Error('boom') })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => {
      expect(screen.getByText("Couldn't load the recipient list.")).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('enables Send for an admin dm once a recipient is selected and the list loaded', async () => {
    mockRecipients({ recipients: [{ id: 'gm-1', display_name: 'GM Alice', avatar_url: null }] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => screen.getByText('GM Alice'))
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'gm-1' } })
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled()
  })

  it('enables Send for an announcement even while the recipient list errored', async () => {
    mockRecipients({ error: new Error('boom') })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    // Announcements never need the recipient picker, so its error must not block.
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled()
  })

  it('toasts and closes without selecting when creation commits but the full row is unavailable', async () => {
    const onSelectThread = vi.fn()
    const createThread = vi.fn().mockResolvedValue('committed')
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    mockHookReturn({ createThread })

    render(<ThreadList onSelectThread={onSelectThread} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My Announcement' } })
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Message sent. The conversation will appear in the list.', 'success')
    })
    expect(onSelectThread).not.toHaveBeenCalled()
    // Modal closed: no duplicate resubmission possible.
    await waitFor(() => {
      expect(screen.queryByText('New Message')).not.toBeInTheDocument()
    })
  })
})

describe('ThreadList non-admin and interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockRecipients()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
  })

  it('shows Message Admin button for non-admin', () => {
    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('Message Admin')).toBeInTheDocument()
  })

  it('calls onSelectThread when thread is clicked', () => {
    mockHookReturn({ threads: [mockThread] })
    const onSelectThread = vi.fn()
    render(<ThreadList onSelectThread={onSelectThread} />)
    fireEvent.click(screen.getByText('Announcement'))
    expect(onSelectThread).toHaveBeenCalledWith(mockThread)
  })

  it('sends a non-admin dm with gmId null (hook resolves sender as gm)', async () => {
    const createThread = vi.fn().mockResolvedValue(mockThread)
    mockHookReturn({ createThread })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('Message Admin'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Body text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      // DMs carry no subject; the modal forwards '' and the hook nulls it.
      expect(createThread).toHaveBeenCalledWith({
        type: 'dm', subject: '', content: 'Body text',
        audience: null, gmId: null
      })
    })
  })

  it('selects recipient from dropdown when type is dm', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    mockRecipients({ recipients: [{ id: 'gm-1', display_name: 'GM Alice', avatar_url: null }] })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    // Switch to DM type
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    await waitFor(() => screen.getByText('GM Alice'))

    // Select the recipient
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'gm-1' } })
    expect(screen.getByText('GM Alice')).toBeInTheDocument()
  })
})
