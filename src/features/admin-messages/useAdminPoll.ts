import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../contexts/ToastContext'
import {
  AdminPollQuestionRowSchema,
  AdminPollReportSchema,
  AdminPollResponseRowSchema,
  AdminPollRowSchema,
  parseRow,
} from '../validation/rowSchemas'
import type { PollAnswer, PollAnswerInput, PollQuestion, PollReport } from './types'

export type PollMeta = {
  description: string | null
  closed_at: string | null
}

export type MyPollResponse = {
  submitted_at: string | null
  answers: PollAnswer[]
}

// Only the poll RPC's own refusal messages reach the UI; an unexpected database
// error must not leak its text to a player.
const POLL_ERROR_MESSAGES = new Set([
  'This poll is closed.',
  'You have already submitted a response to this poll.',
  'Please answer all required questions.',
  'Please answer at least one question before submitting.',
  'Only one option may be selected.',
  'Invalid option selection.',
  'Invalid answer for a choice question.',
  'Invalid answer for a text question.',
  'Duplicate option selection.',
  'Text answers are limited to 500 characters.',
  'Invalid answers.',
  'Poll not found.',
])

// Loads one poll's metadata, ordered questions, the caller's own submission
// (if any) and — for the server admin — the aggregated report. Opening the
// thread marks it read, which is what the report counts as a unique view.
export function useAdminPoll(threadId: string | undefined, isServerAdmin: boolean) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [poll, setPoll] = useState<PollMeta | null>(null)
  const [questions, setQuestions] = useState<PollQuestion[]>([])
  const [myResponse, setMyResponse] = useState<MyPollResponse | null>(null)
  const [report, setReport] = useState<PollReport | null>(null)
  const [reportError, setReportError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Bumped per thread and per request so a slow response for an old thread (or
  // an earlier refresh) cannot overwrite newer state.
  const generationRef = useRef(0)

  const load = useCallback(async (generation: number) => {
    if (!threadId) return
    setLoading(true)
    setError(null)

    const pollResult = await supabase
      .from('admin_polls')
      .select('thread_id, description, closed_at, created_at')
      .eq('thread_id', threadId)
      .maybeSingle()
    if (generation !== generationRef.current) return
    if (pollResult.error) {
      setError(pollResult.error)
      setLoading(false)
      return
    }
    const parsedPoll = pollResult.data ? parseRow(AdminPollRowSchema, pollResult.data) : null

    const questionResult = await supabase
      .from('admin_poll_questions')
      .select('id, thread_id, position, prompt, question_type, is_required, options')
      .eq('thread_id', threadId)
      .order('position', { ascending: true })
    if (generation !== generationRef.current) return
    if (questionResult.error) {
      setError(questionResult.error)
      setLoading(false)
      return
    }
    const parsedQuestions: PollQuestion[] = (questionResult.data ?? []).flatMap(row => {
      const parsed = parseRow(AdminPollQuestionRowSchema, row)
      if (!parsed) return []
      return [{
        id: parsed.id,
        position: parsed.position,
        prompt: parsed.prompt,
        question_type: parsed.question_type,
        is_required: parsed.is_required,
        options: parsed.options ?? [],
      }]
    })

    let parsedResponse: MyPollResponse | null = null
    if (user?.id) {
      const responseResult = await supabase
        .from('admin_poll_responses')
        .select('id, thread_id, user_id, submitted_at, admin_poll_answers(question_id, selected_options, text_answer)')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (generation !== generationRef.current) return
      if (responseResult.error) {
        // Without this read the form would reappear for someone who already
        // answered, and every submit would be refused as a duplicate.
        setError(responseResult.error)
        setLoading(false)
        return
      }
      if (responseResult.data) {
        const parsed = parseRow(AdminPollResponseRowSchema, responseResult.data)
        if (parsed) {
          parsedResponse = {
            submitted_at: parsed.submitted_at ?? null,
            answers: (parsed.admin_poll_answers ?? []).map(a => ({
              question_id: a.question_id,
              selected_options: a.selected_options ?? [],
              text_answer: a.text_answer ?? null,
            })),
          }
        }
      }
    }

    let parsedReport: PollReport | null = null
    let reportFailure: Error | null = null
    if (isServerAdmin) {
      const reportResult = await supabase.rpc('get_admin_poll_report', { p_thread_id: threadId })
      if (generation !== generationRef.current) return
      // The form stays usable when only the report fails; the report area shows
      // its own Retry.
      if (reportResult.error) reportFailure = reportResult.error
      if (reportResult.data) {
        const parsed = parseRow(AdminPollReportSchema, reportResult.data)
        if (parsed) {
          parsedReport = {
            thread_id: parsed.thread_id,
            closed_at: parsed.closed_at ?? null,
            views: parsed.views,
            replies: parsed.replies,
            questions: parsed.questions.map(q => ({
              id: q.question_id,
              position: q.position,
              prompt: q.prompt,
              question_type: q.question_type,
              is_required: q.is_required,
              options: q.options ?? [],
              total_answers: q.total_answers,
              option_counts: q.option_counts ?? null,
              text_answers: q.text_answers ?? null,
            })),
          }
        }
      }
    }

    if (generation !== generationRef.current) return
    setPoll(parsedPoll ? { description: parsedPoll.description ?? null, closed_at: parsedPoll.closed_at ?? null } : null)
    setQuestions(parsedQuestions)
    setMyResponse(parsedResponse)
    setReport(parsedReport)
    setReportError(reportFailure)
    setLoading(false)
  }, [threadId, user?.id, isServerAdmin])

  useEffect(() => {
    const generation = ++generationRef.current
    // Reset synchronously so a previous poll's questions never render under a
    // newly selected thread.
    setPoll(null)
    setQuestions([])
    setMyResponse(null)
    setReport(null)
    setReportError(null)
    setError(null)
    if (!threadId) {
      setLoading(false)
      return
    }
    // `.then` (not `void`) — a supabase-js RPC is a lazy thenable that only
    // fires when subscribed. A read failure is non-critical here.
    supabase.rpc('mark_admin_thread_read', { p_thread_id: threadId })
      .then(() => {}, () => {})
    void load(generation)
  }, [threadId, load])

  const reload = useCallback(async () => {
    const generation = ++generationRef.current
    await load(generation)
  }, [load])

  const refetch = useCallback(() => {
    void reload()
  }, [reload])

  const submitResponse = useCallback(async (answers: PollAnswerInput[]): Promise<boolean> => {
    if (!threadId) return false
    const payload = answers.map(a => ({
      question_id: a.question_id,
      selected_options: a.selected_options ?? [],
      text_answer: a.text_answer ?? null,
    }))
    const { error: rpcError } = await supabase.rpc('submit_admin_poll_response', {
      p_thread_id: threadId,
      p_answers: payload,
    })
    if (rpcError) {
      // A poll closed in another tab lands here: refetch so the closed banner
      // replaces the form instead of leaving it retryable.
      void reload()
      addToast(
        POLL_ERROR_MESSAGES.has(rpcError.message)
          ? rpcError.message
          : "Couldn't submit your response. Please try again.",
        'error'
      )
      return false
    }
    addToast('Your response has been recorded.', 'success')
    // Keep the accepted answers on screen even if the refresh below fails; the
    // server has already recorded the only submission this user gets.
    setMyResponse({
      submitted_at: new Date().toISOString(),
      answers: payload.map(a => ({
        question_id: a.question_id,
        selected_options: a.selected_options,
        text_answer: a.text_answer,
      })),
    })
    await reload()
    return true
  }, [threadId, addToast, reload])

  const closePoll = useCallback(async (): Promise<boolean> => {
    if (!threadId) return false
    const { error: rpcError } = await supabase.rpc('close_admin_poll', { p_thread_id: threadId })
    if (rpcError) {
      addToast("Couldn't close the poll. Please try again.", 'error')
      return false
    }
    addToast('Poll closed.', 'success')
    await reload()
    return true
  }, [threadId, addToast, reload])

  return { poll, questions, myResponse, report, reportError, loading, error, refetch, submitResponse, closePoll }
}
