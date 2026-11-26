import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThreadList, BUG_REPORT_TEMPLATE } from './ThreadList'
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
    createPoll: vi.fn(),
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

  it('opens the composer prefilled for a bug report request (#796)', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    const createThread = vi.fn().mockResolvedValue(null)
    mockHookReturn({ createThread })

    const { rerender, container } = render(<ThreadList onSelectThread={vi.fn()} composeRequest={0} />)
    expect(screen.queryByText('New Message')).not.toBeInTheDocument()

    rerender(<ThreadList onSelectThread={vi.fn()} composeRequest={1} />)
    await waitFor(() => screen.getByText('New Message'))
    // Portaled out of the list pane, which mobile hides when a thread is open.
    expect(container.contains(screen.getByText('New Message'))).toBe(false)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('Bug report (Role by Post v')
    expect(textarea.value).toContain('What happened:')
    expect(textarea.value).toContain('Device / browser:')

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(createThread).toHaveBeenCalledWith(expect.objectContaining({
        type: 'dm', gmId: null, content: BUG_REPORT_TEMPLATE,
      }))
    })

    // The template is used once: a later manual composer tap starts empty.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('New Message')).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('Message Admin'))
    await waitFor(() => screen.getByText('New Message'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
  })

  it('applies a bug report request to an already-open, empty composer without clobbering a draft', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    mockHookReturn({})

    const { rerender } = render(<ThreadList onSelectThread={vi.fn()} composeRequest={0} />)
    fireEvent.click(screen.getByText('Message Admin'))
    await waitFor(() => screen.getByText('New Message'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')

    // Open and empty: the request fills it in.
    rerender(<ThreadList onSelectThread={vi.fn()} composeRequest={1} />)
    await waitFor(() => {
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('What happened:')
    })

    // Open with a draft: the request must not replace what was typed.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my draft' } })
    rerender(<ThreadList onSelectThread={vi.fn()} composeRequest={2} />)
    await waitFor(() => {
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('my draft')
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

  it('labels a system thread without an audience chip', () => {
    mockHookReturn({
      threads: [{
        ...mockThread,
        id: 't-sys', type: 'system', subject: 'System', audience: null,
      }],
    })
    render(<ThreadList onSelectThread={vi.fn()} />)
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('System messages')).toBeInTheDocument()
    expect(screen.queryByText('All users')).not.toBeInTheDocument()
    expect(screen.queryByText('GMs')).not.toBeInTheDocument()
  })

  it('renders a poll row with its audience chip and subject', () => {
    mockHookReturn({
      threads: [{
        ...mockThread,
        id: 't-poll', type: 'poll', subject: 'Community feedback', audience: 'all_users',
      }],
    })
    render(<ThreadList onSelectThread={vi.fn()} />)

    expect(screen.getByText('Poll')).toBeInTheDocument()
    expect(screen.getByText('Community feedback')).toBeInTheDocument()
    expect(screen.getByText('All users')).toBeInTheDocument()
  })
})

describe('NewThreadModal poll composer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockRecipients()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
  })

  function openPollComposer() {
    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'poll' } })
  }

  it('publishes a poll with its subject, audience and questions', async () => {
    const createPoll = vi.fn().mockResolvedValue({ ...mockThread, type: 'poll', subject: 'Feedback' })
    mockHookReturn({ createPoll })
    const onSelectThread = vi.fn()

    render(<ThreadList onSelectThread={onSelectThread} />)
    fireEvent.click(screen.getByText('New'))
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'poll' } })
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'all_users' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Feedback' } })
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: '  Tell us more  ' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Pick one' } })
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish Poll' }))

    await waitFor(() => {
      expect(createPoll).toHaveBeenCalledWith({
        subject: 'Feedback',
        description: 'Tell us more',
        audience: 'all_users',
        questions: [{
          prompt: 'Pick one', question_type: 'single_choice', is_required: true, options: ['A', 'B'],
        }],
      })
    })
    expect(onSelectThread).toHaveBeenCalled()
  })

  it('adds, reorders and removes questions', () => {
    openPollComposer()

    // A single question cannot be removed or moved up.
    expect(screen.getByRole('button', { name: 'Remove question 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move question 1 up' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'First' } })
    fireEvent.click(screen.getByText('+ Add question'))
    expect(screen.getAllByLabelText('Prompt')).toHaveLength(2)
    fireEvent.change(screen.getAllByLabelText('Prompt')[1], { target: { value: 'Second' } })

    fireEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }))
    expect((screen.getAllByLabelText('Prompt')[0] as HTMLInputElement).value).toBe('Second')

    fireEvent.click(screen.getByRole('button', { name: 'Remove question 1' }))
    expect(screen.getAllByLabelText('Prompt')).toHaveLength(1)
    expect((screen.getByLabelText('Prompt') as HTMLInputElement).value).toBe('First')
  })

  it('adds and removes options within the 2 to 5 limit', () => {
    openPollComposer()

    expect(screen.queryByRole('button', { name: 'Remove option 1 of question 1' })).toBeDisabled()
    fireEvent.click(screen.getByText('+ Add option'))
    expect(screen.getByLabelText('Option 3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Add option'))
    fireEvent.click(screen.getByText('+ Add option'))
    expect(screen.getAllByLabelText(/^Option \d$/)).toHaveLength(5)
    expect(screen.queryByText('+ Add option')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove option 5 of question 1' }))
    expect(screen.getAllByLabelText(/^Option \d$/)).toHaveLength(4)
  })

  it('hides the option inputs for an open short text question', () => {
    openPollComposer()

    fireEvent.change(screen.getByLabelText('Question type'), { target: { value: 'short_text' } })
    expect(screen.queryByLabelText('Option 1')).not.toBeInTheDocument()
  })

  it('sends a question marked optional as not required', async () => {
    const createPoll = vi.fn().mockResolvedValue({ ...mockThread, type: 'poll' })
    mockHookReturn({ createPoll })
    openPollComposer()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Feedback' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Pick one' } })
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'B' } })
    fireEvent.click(screen.getByLabelText('Required'))
    fireEvent.click(screen.getByRole('button', { name: 'Publish Poll' }))

    await waitFor(() => {
      expect(createPoll).toHaveBeenCalledWith(expect.objectContaining({
        questions: [expect.objectContaining({ is_required: false })],
      }))
    })
  })

  it('refuses a whitespace-only subject without calling the RPC', async () => {
    const createPoll = vi.fn()
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    mockHookReturn({ createPoll })
    openPollComposer()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Pick one' } })
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'B' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Publish Poll' }).closest('form') as HTMLFormElement)

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('A subject is required (100 characters max).', 'error')
    })
    expect(createPoll).not.toHaveBeenCalled()
  })

  it('refuses blank option labels without calling the RPC', async () => {
    const createPoll = vi.fn()
    const addToast = vi.fn()
    vi.mocked(useToast).mockReturnValue({ addToast, removeToast: vi.fn() } as any)
    mockHookReturn({ createPoll })
    openPollComposer()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Feedback' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Pick one' } })
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: '  ' } })
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'B' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Publish Poll' }).closest('form') as HTMLFormElement)

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        'Every question needs a prompt, and choice questions need 2 to 5 labelled options.',
        'error',
      )
    })
    expect(createPoll).not.toHaveBeenCalled()
  })

  it('keeps the composer open when publishing fails', async () => {
    const createPoll = vi.fn().mockResolvedValue(null)
    mockHookReturn({ createPoll })
    openPollComposer()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Feedback' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Pick one' } })
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish Poll' }))

    await waitFor(() => expect(createPoll).toHaveBeenCalled())
    expect(screen.getByText('New Message')).toBeInTheDocument()
  })
})

describe('NewThreadModal dirty-state discard guard (#850)', () => {
  const discardDialog = () => screen.queryByRole('dialog', { name: 'Discard message?' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn()
    mockRecipients()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    vi.mocked(useToast).mockReturnValue({ addToast: vi.fn(), removeToast: vi.fn() } as any)
  })

  function openComposer() {
    render(<ThreadList onSelectThread={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
  }

  it('closes a clean composer on Cancel with no confirm', () => {
    openComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(discardDialog()).not.toBeInTheDocument()
    expect(screen.queryByText('New Message')).not.toBeInTheDocument()
  })

  it('closes a clean composer on Escape (new path)', () => {
    openComposer()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('New Message')).not.toBeInTheDocument()
  })

  it('closes a clean composer on the backdrop (new path)', () => {
    openComposer()
    fireEvent.click(screen.getByTestId('new-thread-backdrop'))
    expect(screen.queryByText('New Message')).not.toBeInTheDocument()
  })

  it('asks before discarding a typed announcement', () => {
    openComposer()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Downtime tonight' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(discardDialog()).toBeInTheDocument()
    expect(screen.getByText('New Message')).toBeInTheDocument()
  })

  it('keeps the draft when the confirm is cancelled, discards it on confirm', () => {
    openComposer()

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'long body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(discardDialog()).toBeInTheDocument()

    fireEvent.click(within(discardDialog()!).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Message')).toHaveValue('long body')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('New Message')).not.toBeInTheDocument()
  })

  it('guards Escape and the backdrop while a draft exists', () => {
    openComposer()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Downtime tonight' } })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(discardDialog()).toBeInTheDocument()
    fireEvent.click(within(discardDialog()!).getByRole('button', { name: 'Cancel' }))
    expect(discardDialog()).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('new-thread-backdrop'))
    expect(discardDialog()).toBeInTheDocument()
    expect(screen.getByText('New Message')).toBeInTheDocument()
  })

  it('guards a typed poll question', () => {
    openComposer()

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'poll' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Which night?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(discardDialog()).toBeInTheDocument()
  })

  it('treats an untouched pre-filled bug report as a clean baseline', () => {
    render(<ThreadList onSelectThread={vi.fn()} composeRequest={1} />)

    // The template arrives as initialContent, not as a user draft.
    expect(screen.getByLabelText('Message')).toHaveValue(BUG_REPORT_TEMPLATE)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(discardDialog()).not.toBeInTheDocument()
    expect(screen.queryByText('New Message')).not.toBeInTheDocument()
  })
})
