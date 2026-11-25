import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { useAdminPoll } from './useAdminPoll'
import { ToastProvider } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

function toastWrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

// Chainable PostgREST stand-in: filters are no-ops, and both `order()` and
// `maybeSingle()` resolve with the table's canned result.
function tableQuery(result: { data: unknown, error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
  }
  return chain
}

const poll = { thread_id: 't-poll', description: 'Tell us', closed_at: null, created_at: '2026-11-01T00:00:00Z' }

const questions = [
  {
    id: 'q1', thread_id: 't-poll', position: 0, prompt: 'Pick one',
    question_type: 'single_choice', is_required: true, options: ['A', 'B'],
  },
  {
    id: 'q2', thread_id: 't-poll', position: 1, prompt: 'Anything else?',
    question_type: 'short_text', is_required: false, options: [],
  },
]

const report = {
  thread_id: 't-poll', closed_at: null, views: 4, replies: 2,
  questions: [{
    question_id: 'q1', position: 0, prompt: 'Pick one', question_type: 'single_choice',
    is_required: true, options: ['A', 'B'], total_answers: 2,
    option_counts: [1, 1], text_answers: null,
  }],
}

function mockTables({
  pollResult = { data: poll, error: null },
  questionsResult = { data: questions, error: null },
  responseResult = { data: null, error: null },
  reportResult = { data: report, error: null },
}: {
  pollResult?: { data: unknown, error: unknown },
  questionsResult?: { data: unknown, error: unknown },
  responseResult?: { data: unknown, error: unknown },
  reportResult?: { data: unknown, error: unknown },
} = {}) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'admin_polls') return tableQuery(pollResult)
    if (table === 'admin_poll_questions') return tableQuery(questionsResult)
    if (table === 'admin_poll_responses') return tableQuery(responseResult)
    return tableQuery({ data: null, error: null })
  }) as any)
  vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
    if (name === 'get_admin_poll_report') return Promise.resolve(reportResult)
    return Promise.resolve({ data: null, error: null })
  }) as any)
}

describe('useAdminPoll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    mockTables()
  })

  it('loads the poll and questions and marks the thread read', async () => {
    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.poll).toEqual({ description: 'Tell us', closed_at: null })
    expect(result.current.questions).toHaveLength(2)
    expect(result.current.questions[0].options).toEqual(['A', 'B'])
    expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_thread_read', { p_thread_id: 't-poll' })
  })

  it('does not fetch the admin report for a non-admin', async () => {
    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.report).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalledWith('get_admin_poll_report', expect.anything())
  })

  it('loads the aggregated report for the server admin', async () => {
    const { result } = renderHook(() => useAdminPoll('t-poll', true), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.report).not.toBeNull())

    expect(result.current.report?.views).toBe(4)
    expect(result.current.report?.replies).toBe(2)
    expect(result.current.report?.questions[0].option_counts).toEqual([1, 1])
  })

  it('parses the caller’s own submitted response', async () => {
    mockTables({
      responseResult: {
        data: {
          id: 'r1', thread_id: 't-poll', user_id: 'u1', submitted_at: '2026-11-02T00:00:00Z',
          admin_poll_answers: [{ question_id: 'q1', selected_options: [1], text_answer: null }],
        },
        error: null,
      },
    })

    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.myResponse?.answers).toEqual([
      { question_id: 'q1', selected_options: [1], text_answer: null },
    ])
  })

  it('surfaces a load error and retries on refetch', async () => {
    mockTables({ pollResult: { data: null, error: new Error('boom') } })

    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.error).toEqual(new Error('boom')))

    mockTables()
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.questions).toHaveLength(2)
  })

  it('surfaces a failed read of the caller’s own response instead of showing the form again', async () => {
    mockTables({ responseResult: { data: null, error: new Error('boom') } })

    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.error).toEqual(new Error('boom')))
    expect(result.current.myResponse).toBeNull()
  })

  it('ignores a slower response for a previous thread', async () => {
    let resolveOld!: (v: unknown) => void
    const oldPromise = new Promise(res => { resolveOld = res })
    let pollCalls = 0

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'admin_polls') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => {
            pollCalls += 1
            return pollCalls === 1
              ? oldPromise
              : Promise.resolve({ data: { ...poll, thread_id: 't-new', description: 'New poll' }, error: null })
          },
        }
        return chain
      }
      if (table === 'admin_poll_questions') return tableQuery({ data: [], error: null })
      return tableQuery({ data: null, error: null })
    }) as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    const { result, rerender } = renderHook(({ id }: { id: string }) => useAdminPoll(id, false), {
      initialProps: { id: 't-old' },
      wrapper: toastWrapper,
    })
    rerender({ id: 't-new' })
    await waitFor(() => expect(result.current.poll?.description).toBe('New poll'))

    await act(async () => {
      resolveOld({ data: { ...poll, thread_id: 't-old', description: 'Old poll' }, error: null })
    })

    expect(result.current.poll?.description).toBe('New poll')
  })

  it('submits answers and refreshes the poll', async () => {
    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = false
    await act(async () => {
      ok = await result.current.submitResponse([
        { question_id: 'q1', selected_options: [1], text_answer: null },
      ])
    })

    expect(ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('submit_admin_poll_response', {
      p_thread_id: 't-poll',
      p_answers: [{ question_id: 'q1', selected_options: [1], text_answer: null }],
    })
    expect(document.body.textContent).toContain('Your response has been recorded.')
  })

  it('surfaces the RPC message when submitting fails (e.g. the poll was closed)', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
      if (name === 'submit_admin_poll_response') {
        return Promise.resolve({ data: null, error: { message: 'This poll is closed.' } })
      }
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.submitResponse([{ question_id: 'q1', selected_options: [0] }])
    })

    expect(ok).toBe(false)
    expect(document.body.textContent).toContain('This poll is closed.')
  })

  it('hides an unexpected database error behind a generic message', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
      if (name === 'submit_admin_poll_response') {
        return Promise.resolve({ data: null, error: { message: 'new row violates check constraint "admin_poll_answers_text_check"' } })
      }
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.submitResponse([{ question_id: 'q1', selected_options: [0] }])
    })

    expect(document.body.textContent).toContain("Couldn't submit your response. Please try again.")
    expect(document.body.textContent).not.toContain('check constraint')
  })

  it('exposes a report error separately so the form stays usable', async () => {
    mockTables({ reportResult: { data: null, error: new Error('report boom') } })

    const { result } = renderHook(() => useAdminPoll('t-poll', true), { wrapper: toastWrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.reportError).toEqual(new Error('report boom'))
    expect(result.current.report).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.questions).toHaveLength(2)
  })

  it('keeps the accepted answers when the refresh after submitting fails', async () => {
    let failNextLoad = false
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'admin_polls' && failNextLoad) {
        return tableQuery({ data: null, error: new Error('reload boom') })
      }
      if (table === 'admin_polls') return tableQuery({ data: poll, error: null })
      if (table === 'admin_poll_questions') return tableQuery({ data: questions, error: null })
      return tableQuery({ data: null, error: null })
    }) as any)
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    const { result } = renderHook(() => useAdminPoll('t-poll', false), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    failNextLoad = true
    await act(async () => {
      await result.current.submitResponse([{ question_id: 'q1', selected_options: [1] }])
    })

    expect(result.current.myResponse?.answers).toEqual([
      { question_id: 'q1', selected_options: [1], text_answer: null },
    ])
  })

  it('closes the poll and refreshes the report', async () => {
    const { result } = renderHook(() => useAdminPoll('t-poll', true), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = false
    await act(async () => {
      ok = await result.current.closePoll()
    })

    expect(ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('close_admin_poll', { p_thread_id: 't-poll' })
    expect(document.body.textContent).toContain('Poll closed.')
  })

  it('toasts when closing the poll fails', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
      if (name === 'close_admin_poll') return Promise.resolve({ data: null, error: { message: 'boom' } })
      if (name === 'get_admin_poll_report') return Promise.resolve({ data: report, error: null })
      return Promise.resolve({ data: null, error: null })
    }) as any)

    const { result } = renderHook(() => useAdminPoll('t-poll', true), { wrapper: toastWrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.closePoll()
    })

    expect(ok).toBe(false)
    expect(document.body.textContent).toContain("Couldn't close the poll")
  })

  it('stays idle without a thread id', () => {
    const { result } = renderHook(() => useAdminPoll(undefined, true), { wrapper: toastWrapper })

    expect(result.current.loading).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
