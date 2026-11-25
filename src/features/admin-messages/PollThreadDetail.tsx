import { useState } from 'react'
import type { Thread, PollAnswerInput, PollQuestion, PollReportQuestion } from './types'
import { useAdminPoll } from './useAdminPoll'
import { useAdminThreadActions } from './useAdminThreads'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { ConfirmDialog } from '../../components/ConfirmDialog'

const TEXT_ANSWER_MAX = 500

function percentage(count: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((count / total) * 100))
}

function QuestionResults({ question }: { question: PollReportQuestion }) {
  // Percentages use this question's own answer count, so the bars agree with
  // the "N answers" header even when an optional question was skipped.
  const total = question.total_answers
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{question.prompt}</p>
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
          {total} {total === 1 ? 'answer' : 'answers'}
        </span>
      </div>

      {question.question_type === 'short_text' ? (
        (question.text_answers && question.text_answers.length > 0) ? (
          <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {question.text_answers.map((answer, index) => (
              <li
                key={`${question.id}-text-${index}`}
                className="py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words"
              >
                {answer}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No text responses yet.</p>
        )
      ) : (
        <ul className="space-y-2">
          {question.options.map((label, index) => {
            const count = question.option_counts?.[index] ?? 0
            const pct = percentage(count, total)
            return (
              <li key={`${question.id}-option-${index}`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-gray-700 dark:text-gray-300 break-words">{label}</span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{count} ({pct}%)</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true">
                  <div className="h-2 rounded-full bg-indigo-600 dark:bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AdminReport({ questions, views, replies, closed }: { questions: PollReportQuestion[], views: number, replies: number, closed: boolean }) {
  const rate = views > 0 ? Math.round((replies / views) * 100) : 0
  return (
    <section aria-label="Poll report" className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Views</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{views}</div>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Replies</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{replies}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{rate}% response rate</div>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{closed ? 'Closed' : 'Open'}</div>
        </div>
      </div>

      {questions.map(question => (
        <QuestionResults key={question.id} question={question} />
      ))}
    </section>
  )
}

export function PollThreadDetail({ thread, onBack }: { thread: Thread, onBack: () => void }) {
  const { isServerAdmin } = useIsServerAdmin()
  const { poll, questions, myResponse, report, reportError, loading, error, refetch, submitResponse, closePoll } = useAdminPoll(thread.id, isServerAdmin)
  const { deleteThread } = useAdminThreadActions()
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({})
  const [choices, setChoices] = useState<Record<string, number[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'close' | 'thread' | null>(null)

  const closed = Boolean(poll?.closed_at)
  const submitted = myResponse !== null
  const audienceLabel = thread.audience === 'all_users' ? 'All users' : 'GMs'

  const toggleChoice = (question: PollQuestion, index: number) => {
    setFormError(null)
    setChoices(prev => {
      const current = prev[question.id] ?? []
      if (question.question_type === 'single_choice') {
        return { ...prev, [question.id]: [index] }
      }
      const next = current.includes(index)
        ? current.filter(i => i !== index)
        : [...current, index].sort((a, b) => a - b)
      return { ...prev, [question.id]: next }
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const answers: PollAnswerInput[] = []
    let answered = 0
    for (const question of questions) {
      const text = (textAnswers[question.id] ?? '').trim()
      const selected = question.question_type === 'short_text' ? [] : (choices[question.id] ?? [])

      if (question.is_required) {
        const missing = question.question_type === 'short_text' ? !text : selected.length === 0
        if (missing) {
          setFormError('Please answer all required questions.')
          return
        }
      }

      if (text || selected.length > 0) {
        answered += 1
        answers.push({
          question_id: question.id,
          selected_options: selected,
          text_answer: question.question_type === 'short_text' ? text : null,
        })
      }
    }

    if (answered === 0) {
      setFormError('Please answer at least one question before submitting.')
      return
    }

    setSubmitting(true)
    const ok = await submitResponse(answers)
    setSubmitting(false)
    if (ok) {
      setTextAnswers({})
      setChoices({})
    }
  }

  const handleClose = async () => {
    setConfirmAction(null)
    await closePoll()
  }

  const handleDeleteThread = async () => {
    setConfirmAction(null)
    const ok = await deleteThread(thread.id)
    if (ok) onBack()
  }

  const submittedAnswer = (question: PollQuestion) => {
    const answer = myResponse?.answers.find(a => a.question_id === question.id)
    if (!answer) return null
    if (question.question_type === 'short_text') return answer.text_answer
    return answer.selected_options.map(index => question.options[index]).filter(Boolean).join(', ')
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to messages" className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{thread.subject || 'Poll'}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Poll · {audienceLabel}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.6875rem] font-medium ${closed ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300'}`}>
              {closed ? 'Closed' : 'Open'}
            </span>
          </div>
        </div>
        {isServerAdmin && !closed && (
          <button type="button" onClick={() => setConfirmAction('close')} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
            Close Poll
          </button>
        )}
        {isServerAdmin && (
          <button type="button" onClick={() => setConfirmAction('thread')} className="text-red-500 hover:text-red-700 p-2" title="Delete Thread" aria-label="Delete Thread">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain p-4 space-y-6">
        {error && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load the poll.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold hover:underline">Retry</button>
          </div>
        )}

        {loading && questions.length === 0 && !error && (
          <div className="flex justify-center p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500" aria-label="Loading"></div>
          </div>
        )}

        {poll?.description && (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{poll.description}</p>
        )}

        {isServerAdmin && reportError && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load the poll report.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold hover:underline">Retry</button>
          </div>
        )}

        {isServerAdmin && report && (
          <AdminReport
            questions={report.questions}
            views={report.views}
            replies={report.replies}
            closed={closed}
          />
        )}

        {closed && !submitted && (
          <div role="status" className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
            This poll is closed.
          </div>
        )}

        {submitted ? (
          <section aria-label="Your answers" className="space-y-4">
            <div role="status" className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
              {myResponse?.submitted_at
                ? `You submitted your response on ${new Date(myResponse.submitted_at).toLocaleDateString()}.`
                : 'You submitted your response.'}
            </div>
            {questions.map((question, index) => {
              const value = submittedAnswer(question)
              return (
                <div key={question.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                    {index + 1}. {question.prompt}
                  </p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                    {value ? value : <span className="italic text-gray-500 dark:text-gray-400">No answer provided</span>}
                  </p>
                </div>
              )
            })}
          </section>
        ) : (
          !loading || questions.length > 0 ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {questions.map((question, index) => {
                const groupName = `poll-question-${question.id}`
                const text = textAnswers[question.id] ?? ''
                const selected = choices[question.id] ?? []
                return (
                  <fieldset
                    key={question.id}
                    disabled={closed}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 min-w-0"
                  >
                    <legend className="px-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {index + 1}. {question.prompt}
                      <span className={`ml-2 text-xs font-normal ${question.is_required ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {question.is_required ? 'Required' : 'Optional'}
                      </span>
                    </legend>

                    {question.question_type === 'short_text' ? (
                      <div className="mt-2">
                        <label htmlFor={`${groupName}-text`} className="sr-only">{question.prompt}</label>
                        <textarea
                          id={`${groupName}-text`}
                          value={text}
                          maxLength={TEXT_ANSWER_MAX}
                          onChange={e => {
                            setFormError(null)
                            setTextAnswers(prev => ({ ...prev, [question.id]: e.target.value }))
                          }}
                          rows={3}
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                        <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
                          {text.length}/{TEXT_ANSWER_MAX}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {question.options.map((label, optionIndex) => (
                          <label key={`${question.id}-${optionIndex}`} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type={question.question_type === 'single_choice' ? 'radio' : 'checkbox'}
                              name={groupName}
                              value={optionIndex}
                              checked={selected.includes(optionIndex)}
                              onChange={() => toggleChoice(question, optionIndex)}
                              className="mt-0.5"
                            />
                            <span className="break-words">{label}</span>
                          </label>
                        ))}
                        {question.question_type === 'single_choice' && !question.is_required && selected.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormError(null)
                              setChoices(prev => ({ ...prev, [question.id]: [] }))
                            }}
                            className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline"
                          >
                            Clear selection
                          </button>
                        )}
                      </div>
                    )}
                  </fieldset>
                )
              })}

              {formError && (
                <div role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded px-3 py-2">
                  {formError}
                </div>
              )}

              {!closed && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Response'}
                  </button>
                </div>
              )}
            </form>
          ) : null
        )}
      </div>

      {confirmAction === 'close' && (
        <ConfirmDialog
          title="Close this poll?"
          description="No one will be able to submit a response after this."
          confirmLabel="Close Poll"
          onConfirm={handleClose}
          onClose={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'thread' && (
        <ConfirmDialog
          title="Delete this entire thread?"
          description="This also deletes every question and every submitted response."
          confirmLabel="Delete Thread"
          onConfirm={handleDeleteThread}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
