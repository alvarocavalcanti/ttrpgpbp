import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollThreadDetail } from './PollThreadDetail'
import type { Thread, PollQuestion, PollReport } from './types'
import { useAdminPoll } from './useAdminPoll'
import { useAdminThreadActions } from './useAdminThreads'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'

vi.mock('./useAdminPoll', () => ({
  useAdminPoll: vi.fn(),
}))

vi.mock('./useAdminThreads', () => ({
  useAdminThreadActions: vi.fn(),
}))

vi.mock('../../hooks/useIsServerAdmin', () => ({
  useIsServerAdmin: vi.fn(),
}))

const mockThread: Thread = {
  id: 't-poll',
  type: 'poll',
  subject: 'Community feedback',
  gm_id: null,
  audience: 'all_users',
  created_by: 'user-admin',
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  creator: { display_name: 'Admin', avatar_url: null },
  unread: false,
}

const questions: PollQuestion[] = [
  {
    id: 'q1', position: 0, prompt: 'Which room do you use most?',
    question_type: 'single_choice', is_required: true, options: ['Main', 'Rooms'],
  },
  {
    id: 'q2', position: 1, prompt: 'Anything else?',
    question_type: 'short_text', is_required: false, options: [],
  },
]

const report: PollReport = {
  thread_id: 't-poll',
  closed_at: null,
  views: 4,
  replies: 2,
  questions: [
    {
      id: 'q1', position: 0, prompt: 'Which room do you use most?',
      question_type: 'single_choice', is_required: true, options: ['Main', 'Rooms'],
      total_answers: 2, option_counts: [1, 1], text_answers: null,
    },
    {
      id: 'q2', position: 1, prompt: 'Anything else?',
      question_type: 'short_text', is_required: false, options: [],
      total_answers: 1, option_counts: null, text_answers: ['Great work'],
    },
  ],
}

function mockPoll(overrides: Record<string, unknown> = {}) {
  vi.mocked(useAdminPoll).mockReturnValue({
    poll: { description: 'Tell us how it is going.', closed_at: null },
    questions,
    myResponse: null,
    report: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
    submitResponse: vi.fn().mockResolvedValue(true),
    closePoll: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any)
}

describe('PollThreadDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: false, loading: false })
    vi.mocked(useAdminThreadActions).mockReturnValue({
      createThread: vi.fn(), deleteThread: vi.fn().mockResolvedValue(true), createPoll: vi.fn(),
    } as any)
    mockPoll()
  })

  it('shows a spinner while the poll loads', () => {
    mockPoll({ loading: true, questions: [] })
    const { container } = render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders the subject, audience, description, and every question', () => {
    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(screen.getByText('Community feedback')).toBeInTheDocument()
    expect(screen.getByText('Poll · All users')).toBeInTheDocument()
    expect(screen.getByText('Tell us how it is going.')).toBeInTheDocument()
    const first = screen.getByRole('group', { name: /Which room do you use most\?/ })
    expect(within(first).getByText('Required')).toBeInTheDocument()
    expect(within(first).getByLabelText('Main')).toBeInTheDocument()
    const second = screen.getByRole('group', { name: /Anything else\?/ })
    expect(within(second).getByText('Optional')).toBeInTheDocument()
  })

  it('shows the error banner and retries', () => {
    const refetch = vi.fn()
    mockPoll({ error: new Error('boom'), refetch })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText("Couldn't load the poll.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
  })

  it('refuses to submit while a required question is unanswered', async () => {
    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please answer all required questions.')
  })

  it('refuses a completely empty submission when every question is optional', async () => {
    mockPoll({
      questions: [questions[1]],
    })
    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please answer at least one question before submitting.')
  })

  it('submits the selected option and the trimmed text answer with a live counter', async () => {
    const submitResponse = vi.fn().mockResolvedValue(true)
    mockPoll({ submitResponse })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Rooms'))
    const textarea = screen.getByLabelText('Anything else?')
    fireEvent.change(textarea, { target: { value: '  Great work  ' } })
    expect(screen.getByText('14/500')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }))

    await waitFor(() => {
      expect(submitResponse).toHaveBeenCalledWith([
        { question_id: 'q1', selected_options: [1], text_answer: null },
        { question_id: 'q2', selected_options: [], text_answer: 'Great work' },
      ])
    })
  })

  it('keeps a single choice question to one option', () => {
    const submitResponse = vi.fn().mockResolvedValue(true)
    mockPoll({ submitResponse })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Main'))
    expect(screen.getByLabelText('Main')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Rooms'))
    expect(screen.getByLabelText('Main')).not.toBeChecked()
    expect(screen.getByLabelText('Rooms')).toBeChecked()
  })

  it('shows the submitted answers read-only with no submit button', () => {
    mockPoll({
      myResponse: {
        submitted_at: '2026-11-20T00:00:00Z',
        answers: [
          { question_id: 'q1', selected_options: [1], text_answer: null },
          { question_id: 'q2', selected_options: [], text_answer: 'Great work' },
        ],
      },
    })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('You submitted your response on')
    expect(screen.getByText('Rooms')).toBeInTheDocument()
    expect(screen.getByText('Great work')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Response' })).not.toBeInTheDocument()
  })

  it('shows "No answer provided" for a skipped optional question', () => {
    mockPoll({
      myResponse: {
        submitted_at: '2026-11-20T00:00:00Z',
        answers: [{ question_id: 'q1', selected_options: [0], text_answer: null }],
      },
    })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('No answer provided')).toBeInTheDocument()
  })

  it('disables the form and hides Submit once the poll is closed', () => {
    mockPoll({ poll: { description: null, closed_at: '2026-11-21T00:00:00Z' } })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('This poll is closed.')
    expect(screen.getByLabelText('Main')).toBeDisabled()
    expect(screen.getByLabelText('Anything else?')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Submit Response' })).not.toBeInTheDocument()
  })

  it('lets an optional single-choice answer be cleared', () => {
    mockPoll({ questions: [{ ...questions[0], is_required: false }] })
    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Main'))
    expect(screen.getByLabelText('Main')).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByLabelText('Main')).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('keeps no clear control on a required single-choice question', () => {
    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Main'))
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('shows a report error with Retry while the form stays usable', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    const refetch = vi.fn()
    mockPoll({ reportError: new Error('boom'), refetch })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(screen.getByText("Couldn't load the poll report.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit Response' })).toBeInTheDocument()
  })

  it('shows the aggregated admin report with counts and percentages', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    mockPoll({ report })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)

    expect(screen.getByText('Views')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('50% response rate')).toBeInTheDocument()
    expect(screen.getAllByText('1 (50%)')).toHaveLength(2)
    expect(screen.getByText('Great work')).toBeInTheDocument()
  })

  it('shows an explicit empty state for a question with no text responses', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    mockPoll({
      report: {
        ...report,
        questions: [{ ...report.questions[1], text_answers: [] }],
      },
    })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('No text responses yet.')).toBeInTheDocument()
  })

  it('bases option percentages on that question’s answers, not total replies', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    mockPoll({
      report: {
        ...report,
        replies: 2,
        questions: [{
          ...report.questions[0],
          total_answers: 1,
          option_counts: [1, 0],
        }],
      },
    })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.getByText('1 (100%)')).toBeInTheDocument()
    expect(screen.getByText('0 (0%)')).toBeInTheDocument()
  })

  it('closes the poll after confirmation', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    const closePoll = vi.fn().mockResolvedValue(true)
    mockPoll({ report, closePoll })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close Poll' }))
    const dialog = screen.getByRole('dialog', { name: 'Close this poll?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Poll' }))

    await waitFor(() => expect(closePoll).toHaveBeenCalled())
  })

  it('hides Close Poll once the poll is closed', () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    mockPoll({
      poll: { description: null, closed_at: '2026-11-21T00:00:00Z' },
      report: { ...report, closed_at: '2026-11-21T00:00:00Z' },
    })

    render(<PollThreadDetail thread={mockThread} onBack={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Close Poll' })).not.toBeInTheDocument()
  })

  it('deletes the thread after confirmation and navigates back', async () => {
    vi.mocked(useIsServerAdmin).mockReturnValue({ isServerAdmin: true, loading: false })
    const deleteThread = vi.fn().mockResolvedValue(true)
    vi.mocked(useAdminThreadActions).mockReturnValue({
      createThread: vi.fn(), deleteThread, createPoll: vi.fn(),
    } as any)
    const onBack = vi.fn()
    mockPoll({ report })

    render(<PollThreadDetail thread={mockThread} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Thread' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this entire thread?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Thread' }))

    await waitFor(() => {
      expect(deleteThread).toHaveBeenCalledWith('t-poll')
      expect(onBack).toHaveBeenCalled()
    })
  })
})
