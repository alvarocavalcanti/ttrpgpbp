import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Thread } from './types'
import { useAdminThreads, type CreateThreadInput } from './useAdminThreads'
import type { CreatePollInput, PollQuestionDraft, PollQuestionType } from './types'
import { useMessageRecipients } from './useMessageRecipients'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useIsServerAdmin } from '../../hooks/useIsServerAdmin'
import { useToast } from '../../contexts/ToastContext'

// Bug report shortcut (#796): the composer opens with this template when the
// user arrives from the dedicated Report a Bug entry. The app version is what
// makes the report actionable without a follow-up question.
export const BUG_REPORT_TEMPLATE = [
  `Bug report (Role by Post v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'})`,
  '',
  'What happened:',
  '',
  'What you expected:',
  '',
  'Steps to reproduce:',
  '',
  'Device / browser:',
].join('\n')

/**
 * Server-admin inbox sidebar: message threads with unread state, plus the
 * new-thread composer for server admins.
 */
export function ThreadList({ selectedThreadId, onSelectThread, composeRequest }: { selectedThreadId?: string, onSelectThread: (t: Thread) => void, composeRequest?: number }) {
  const { threads, loading, hasMore, loadMore, refetch, error, createThread, createPoll } = useAdminThreads()
  const { isServerAdmin } = useIsServerAdmin()
  const [showNewModal, setShowNewModal] = useState(false)
  // Held separately from composeRequest so the template is used once: a later
  // manual "New"/"Message Admin" tap must open an empty composer.
  const [composePrefill, setComposePrefill] = useState<string | undefined>(undefined)

  // A new request (not just a truthy flag) reopens the composer, so tapping
  // the menu entry again after closing still works.
  useEffect(() => {
    if (!composeRequest) return
    setComposePrefill(BUG_REPORT_TEMPLATE)
    setShowNewModal(true)
  }, [composeRequest])

  const closeNewModal = () => {
    setShowNewModal(false)
    setComposePrefill(undefined)
  }

  if (loading && threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-white dark:bg-gray-800">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
        {isServerAdmin ? (
          <button type="button" onClick={() => setShowNewModal(true)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
            New
          </button>
        ) : (
          <button type="button" onClick={() => setShowNewModal(true)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
            Message Admin
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {loading && threads.length > 0 && (
          <div className="flex justify-center p-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 dark:border-indigo-500" aria-label="Loading"></div>
          </div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 flex justify-between items-center">
            <span>Couldn't load conversations.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold hover:underline">Retry</button>
          </div>
        )}
        {threads.length === 0 && !error ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No messages yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {threads.map(thread => (
              <button type="button"
                key={thread.id}
                onClick={() => onSelectThread(thread)}
                className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 ${selectedThreadId === thread.id ? 'bg-indigo-50 dark:bg-gray-700/50' : ''}`}
              >
                <div className="flex-shrink-0 mt-1">
                  {thread.type === 'announcement' ? (
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                    </div>
                  ) : thread.type === 'poll' ? (
                    <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center text-violet-600 dark:text-violet-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6m0 0V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14M9 13h4m-4 0v6m4-6V9a2 2 0 012-2h2a2 2 0 012 2v10m-4 0h4m0 0h2a2 2 0 002-2v-4a2 2 0 00-2-2h-2" /></svg>
                    </div>
                  ) : thread.type === 'system' ? (
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                  ) : (
                    <Avatar 
                      src={isServerAdmin ? (thread.gm?.avatar_url || undefined) : (thread.creator.avatar_url || undefined)} 
                      alt="" 
                      className="w-10 h-10 rounded-full" 
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`text-sm truncate ${thread.unread ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                      {thread.type === 'announcement' ? 'Announcement' : thread.type === 'poll' ? 'Poll' : thread.type === 'system' ? 'System' : (isServerAdmin ? thread.gm?.display_name || 'GM' : 'Server Admin')}
                    </h3>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(thread.type === 'announcement' || thread.type === 'poll') && (
                      <span
                        className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[0.6875rem] font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      >
                        {thread.audience === 'all_users' ? 'All users' : 'GMs'}
                      </span>
                    )}
                    <p className={`text-sm truncate ${thread.unread ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                      {thread.type === 'announcement' || thread.type === 'poll' ? thread.subject : thread.type === 'system' ? 'System messages' : 'Direct Message'}
                    </p>
                  </div>
                </div>
                {thread.unread && <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0 mt-2"></div>}
              </button>
            ))}
          </div>
        )}
        {hasMore && (
          <button type="button" onClick={() => loadMore()} className="w-full p-3 text-center text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
                Loading...
              </>
            ) : 'Load more'}
          </button>
        )}
      </div>

      {/* Portaled: on mobile the thread-list pane is `hidden` once a thread is
          selected, and a fixed overlay inside a display:none ancestor would not
          render — the bug-report composer must show even then. */}
      {showNewModal && createPortal(
        <NewThreadModal onClose={closeNewModal} onCreated={onSelectThread} isServerAdmin={isServerAdmin} createThread={createThread} createPoll={createPoll} initialContent={composePrefill} prefillRequest={composeRequest} />,
        document.body,
      )}
    </div>
  )
}

function newPollQuestion(): PollQuestionDraft {
  return {
    key: crypto.randomUUID(),
    prompt: '',
    question_type: 'single_choice',
    is_required: true,
    options: ['', ''],
  }
}

function NewThreadModal({ onClose, onCreated, isServerAdmin, createThread, createPoll, initialContent, prefillRequest }: { onClose: () => void, onCreated: (t: Thread) => void, isServerAdmin: boolean, createThread: (input: CreateThreadInput) => Promise<Thread | 'committed' | null>, createPoll: (input: CreatePollInput) => Promise<Thread | 'committed' | null>, initialContent?: string, prefillRequest?: number }) {
  const [type, setType] = useState<'announcement' | 'dm' | 'poll'>(isServerAdmin ? 'announcement' : 'dm')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState(initialContent ?? '')
  // A bug-report request can land while the composer is already open (keyboard
  // reach into the menu). Apply the template then too, but never replace an
  // unsent draft.
  useEffect(() => {
    if (!prefillRequest || !initialContent) return
    setContent(prev => (prev.trim() ? prev : initialContent))
  }, [prefillRequest, initialContent])
  // Announcements and polls default to the GM-only audience.
  const [audience, setAudience] = useState<'gms' | 'all_users'>('gms')
  const [gmId, setGmId] = useState('')
  const [questions, setQuestions] = useState<PollQuestionDraft[]>([newPollQuestion()])
  const [submitting, setSubmitting] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const { addToast } = useToast()
  const { recipients, loading: recipientsLoading, error: recipientsError, refetch: refetchRecipients } = useMessageRecipients(isServerAdmin)

  // Picking a type or audience alone is not lost work; typed subject/body,
  // poll questions, or a chosen recipient is.
  const isDirty = subject.trim() !== ''
    || content !== (initialContent ?? '')
    || gmId !== ''
    || questions.length > 1
    || questions.some(q => q.prompt.trim() !== '' || q.options.some(option => option.trim() !== ''))

  // Escape, backdrop, the × and Cancel all land here, so a long draft is not
  // lost by an accidental dismissal.
  const requestClose = () => {
    if (submitting) return
    if (!isDirty) {
      onClose()
      return
    }
    setConfirmDiscard(true)
  }
  useEscapeToClose(requestClose)

  const updateQuestion = (key: string, patch: Partial<PollQuestionDraft>) => {
    setQuestions(prev => prev.map(q => (q.key === key ? { ...q, ...patch } : q)))
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const updateOption = (key: string, index: number, value: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.key !== key) return q
      const options = [...q.options]
      options[index] = value
      return { ...q, options }
    }))
  }

  const addOption = (key: string) => {
    setQuestions(prev => prev.map(q => (
      q.key === key && q.options.length < 5 ? { ...q, options: [...q.options, ''] } : q
    )))
  }

  const removeOption = (key: string, index: number) => {
    setQuestions(prev => prev.map(q => (
      q.key === key && q.options.length > 2 ? { ...q, options: q.options.filter((_, i) => i !== index) } : q
    )))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    if (type === 'poll') {
      const trimmedSubject = subject.trim()
      if (!trimmedSubject) {
        addToast('A subject is required (100 characters max).', 'error')
        setSubmitting(false)
        return
      }
      const cleaned = questions.map(q => ({
        prompt: q.prompt.trim(),
        question_type: q.question_type,
        is_required: q.is_required,
        options: q.question_type === 'short_text' ? [] : q.options.map(option => option.trim()),
      }))
      // The RPC refuses these too; catching them here keeps the typed draft
      // and says what is wrong instead of surfacing a generic toast.
      const invalid = cleaned.some(q => (
        !q.prompt
        || (q.question_type !== 'short_text'
          && (q.options.length < 2 || q.options.length > 5 || q.options.some(option => !option)))
      ))
      if (invalid) {
        addToast('Every question needs a prompt, and choice questions need 2 to 5 labelled options.', 'error')
        setSubmitting(false)
        return
      }

      const pollThread = await createPoll({
        subject: trimmedSubject,
        description: content.trim() ? content.trim() : null,
        audience,
        questions: cleaned,
      })
      if (!pollThread) {
        setSubmitting(false)
        return
      }
      if (pollThread === 'committed') {
        addToast('Poll published. It will appear in the list.', 'success')
        onClose()
        return
      }
      onCreated(pollThread)
      onClose()
      return
    }

    const thread = await createThread({
      type,
      subject,
      content,
      audience: type === 'announcement' ? audience : null,
      gmId: type === 'dm' && isServerAdmin ? gmId : null
    })
    // On failure the hook has already surfaced a toast; stay in the modal so
    // the user can retry without retyping.
    if (!thread) {
      setSubmitting(false)
      return
    }
    if (thread === 'committed') {
      // The conversation exists (the list refreshes via realtime) but its
      // full row isn't available to select right away.
      addToast('Message sent. The conversation will appear in the list.', 'success')
      onClose()
      return
    }
    onCreated(thread)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div data-testid="new-thread-backdrop" className="fixed inset-0 bg-black/50" aria-hidden="true" onClick={requestClose} />
      <div className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full overflow-hidden ${type === 'poll' ? 'max-w-lg' : 'max-w-md'}`}>
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[90vh]">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Message</h3>
            <button type="button" onClick={requestClose} aria-label="Close" className="text-gray-400 hover:text-gray-500">&times;</button>
          </div>
          
          <div className="p-4 overflow-y-auto space-y-4">
            {isServerAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-type">Type</label>
                <select id="new-message-type" value={type} onChange={e => setType(e.target.value as 'announcement' | 'dm' | 'poll')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2">
                  <option value="announcement">Announcement</option>
                  <option value="poll">Poll</option>
                  <option value="dm">Direct Message</option>
                </select>
              </div>
            )}

            {type === 'announcement' ? (
              <>
                {isServerAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-audience">Audience</label>
                    <select id="new-message-audience" value={audience} onChange={e => setAudience(e.target.value as 'gms' | 'all_users')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white">
                      <option value="gms">GMs only</option>
                      <option value="all_users">All users</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-subject">Subject</label>
                  <input id="new-message-subject" required maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white" />
                </div>
              </>
            ) : type === 'poll' ? (
              <>
                {isServerAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-audience">Audience</label>
                    <select id="new-message-audience" value={audience} onChange={e => setAudience(e.target.value as 'gms' | 'all_users')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white">
                      <option value="gms">GMs only</option>
                      <option value="all_users">All users</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-subject">Subject</label>
                  <input id="new-message-subject" required maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white" />
                </div>
              </>
            ) : (
              isServerAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-recipient">To user</label>
                  {recipientsError ? (
                    <div className="flex justify-between items-center text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded px-3 py-2">
                      <span>Couldn't load the recipient list.</span>
                      <button type="button" onClick={() => refetchRecipients()} className="font-semibold hover:underline">Retry</button>
                    </div>
                  ) : (
                    <select id="new-message-recipient" required value={gmId} onChange={e => setGmId(e.target.value)} disabled={recipientsLoading} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white">
                      <option value="">{recipientsLoading ? 'Loading users...' : 'Select user...'}</option>
                      {recipients.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
                    </select>
                  )}
                </div>
              )
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="new-message-content">
                {type === 'poll' ? 'Description (optional)' : 'Message'}
              </label>
              <textarea
                id="new-message-content"
                required={type !== 'poll'}
                maxLength={2000}
                rows={type === 'poll' ? 3 : 5}
                value={content}
                onChange={e => setContent(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-gray-900 dark:text-white resize-none"
              />
            </div>

            {type === 'poll' && (
              <div className="space-y-3">
                {questions.map((question, index) => (
                  <div key={question.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Question {index + 1}</h4>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move question ${index + 1} up`}
                          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, 1)}
                          disabled={index === questions.length - 1}
                          aria-label={`Move question ${index + 1} down`}
                          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestions(prev => prev.filter(q => q.key !== question.key))}
                          disabled={questions.length === 1}
                          aria-label={`Remove question ${index + 1}`}
                          className="px-2 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor={`poll-prompt-${question.key}`}>Prompt</label>
                      <input
                        id={`poll-prompt-${question.key}`}
                        required
                        maxLength={300}
                        value={question.prompt}
                        onChange={e => updateQuestion(question.key, { prompt: e.target.value })}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[10rem]">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor={`poll-type-${question.key}`}>Question type</label>
                        <select
                          id={`poll-type-${question.key}`}
                          value={question.question_type}
                          onChange={e => {
                            const nextType = e.target.value as PollQuestionType
                            updateQuestion(question.key, {
                              question_type: nextType,
                              // Choice questions always start with two labels.
                              options: nextType === 'short_text' ? [] : (question.options.length >= 2 ? question.options : ['', '']),
                            })
                          }}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
                        >
                          <option value="single_choice">Single choice</option>
                          <option value="multi_choice">Multiple choice</option>
                          <option value="short_text">Open short text</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={question.is_required}
                          onChange={e => updateQuestion(question.key, { is_required: e.target.checked })}
                        />
                        Required
                      </label>
                    </div>

                    {question.question_type !== 'short_text' && (
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <div key={`${question.key}-option-${optionIndex}`} className="flex items-center gap-2">
                            <label className="sr-only" htmlFor={`poll-option-${question.key}-${optionIndex}`}>Option {optionIndex + 1}</label>
                            <input
                              id={`poll-option-${question.key}-${optionIndex}`}
                              required
                              maxLength={150}
                              value={option}
                              onChange={e => updateOption(question.key, optionIndex, e.target.value)}
                              placeholder={`Option ${optionIndex + 1}`}
                              className="flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(question.key, optionIndex)}
                              disabled={question.options.length <= 2}
                              aria-label={`Remove option ${optionIndex + 1} of question ${index + 1}`}
                              className="px-2 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {question.options.length < 5 && (
                          <button
                            type="button"
                            onClick={() => addOption(question.key)}
                            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            + Add option
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setQuestions(prev => [...prev, newPollQuestion()])}
                  className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Add question
                </button>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button type="button" onClick={requestClose} className="px-4 py-2 text-gray-600 dark:text-gray-300">Cancel</button>
            <button
              type="submit"
              disabled={submitting || (type === 'dm' && isServerAdmin && (!!recipientsError || !gmId))}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting
                ? (type === 'poll' ? 'Publishing...' : 'Sending...')
                : (type === 'poll' ? 'Publish Poll' : 'Send')}
            </button>
          </div>
        </form>
      </div>

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard message?"
          description="Your draft will be lost."
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirmDiscard(false)
            onClose()
          }}
          onClose={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  )
}
