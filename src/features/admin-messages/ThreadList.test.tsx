import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThreadList } from './ThreadList'
import { useAdminThreads } from './useAdminThreads'
import { useActiveGms } from './useActiveGms'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import type { Thread } from './types'

vi.mock('./useAdminThreads', () => ({
  useAdminThreads: vi.fn()
}))

vi.mock('./useActiveGms', () => ({
  useActiveGms: vi.fn()
}))

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn()
}))

const mockThread: Thread = {
  id: 't-1', type: 'announcement', subject: 'Hello', gm_id: null,
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

function mockGms(overrides: Record<string, unknown> = {}) {
  vi.mocked(useActiveGms).mockReturnValue({
    gms: [], loading: false, error: null, refetch: vi.fn(),
    ...overrides
  } as any)
}

describe('ThreadList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockGms()
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
        type: 'announcement', subject: 'My Announcement', content: 'Hello world', gmId: null
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

  it('shows a GM list error with retry in the modal', async () => {
    const refetchGms = vi.fn()
    mockGms({ error: new Error('boom'), refetch: refetchGms })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    // The GM picker only exists for DMs.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    expect(screen.getByText("Couldn't load the GM list.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetchGms).toHaveBeenCalled()
  })

  it('shows a loading placeholder in the GM picker while GMs load', async () => {
    mockGms({ loading: true })

    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    await waitFor(() => screen.getByText('New Message'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'dm' } })
    expect(screen.getByText('Loading GMs...')).toBeInTheDocument()
  })
})

describe('NewThreadModal additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockGms()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
  })

  it('passes the selected GM for an admin-started dm', async () => {
    const createThread = vi.fn().mockResolvedValue(mockThread)
    mockHookReturn({ createThread })
    mockGms({ gms: [{ id: 'gm-1', display_name: 'GM Alice' }] })

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
        type: 'dm', subject: '', content: 'Body', gmId: 'gm-1'
      })
    })
  })

  it('shows GM dropdown when type switched to dm', async () => {
    mockGms({ gms: [{ id: 'gm-1', display_name: 'GM Alice' }] })

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
    mockHookReturn()
    mockGms()
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
        type: 'dm', subject: '', content: 'Body text', gmId: null
      })
    })
  })

  it('selects GM from dropdown when type is dm', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    mockGms({ gms: [{ id: 'gm-1', display_name: 'GM Alice' }] })

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
