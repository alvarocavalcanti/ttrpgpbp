import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { MAX_NOTE_LENGTH } from '../../constants'
import type { NoteScope } from '../validation/rowSchemas'
import { useChannelNotes, type ChannelNote } from './useChannelNotes'

interface CampaignNotesModalProps {
  channelId: string
  initialScope: NoteScope
  isGM: boolean
  readOnly: boolean
  members: { user_id: string; character_name: string }[]
  myUserId: string | undefined
  onClose: () => void
}

const TABS: { scope: NoteScope; label: string; description: string; empty: string }[] = [
  {
    scope: 'character',
    label: 'Character Notes',
    description: 'Only you and the GM can read these.',
    empty: 'No character notes yet.',
  },
  {
    scope: 'party',
    label: 'Party Notes',
    description: 'Everyone in this campaign can read these.',
    empty: 'No party notes yet.',
  },
  {
    scope: 'gm',
    label: 'GM Notes',
    description: 'Only the GM can read these.',
    empty: 'No GM notes yet.',
  },
]

function formatNoteDate(value: string) {
  return new Date(value).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

export function CampaignNotesModal({
  channelId,
  initialScope,
  isGM,
  readOnly,
  members,
  myUserId,
  onClose,
}: CampaignNotesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  const { notes, loading, error, refetch, createNote, updateNote, deleteNote } = useChannelNotes(channelId)

  // A non-GM never gets the GM tab, even if a caller passes it by mistake.
  const visibleTabs = useMemo(
    () => TABS.filter(tab => tab.scope !== 'gm' || isGM),
    [isGM],
  )
  const [activeScope, setActiveScope] = useState<NoteScope>(
    initialScope === 'gm' && !isGM ? 'party' : initialScope,
  )
  const [drafts, setDrafts] = useState<Record<NoteScope, string>>({ character: '', party: '', gm: '' })
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ChannelNote | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const memberNames = useMemo(
    () => new Map(members.map(m => [m.user_id, m.character_name])),
    [members],
  )
  const activeTab = TABS.find(tab => tab.scope === activeScope) ?? TABS[0]
  const description = activeScope === 'character' && isGM
    ? 'Every player’s character notes. Only the author can edit them.'
    : activeTab.description
  const visibleNotes = notes.filter(note => note.scope === activeScope)
  const draft = drafts[activeScope]

  const selectScope = (scope: NoteScope) => {
    setActiveScope(scope)
    setEditing(null)
    setActionError(null)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = visibleTabs.findIndex(tab => tab.scope === activeScope)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % visibleTabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + visibleTabs.length) % visibleTabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = visibleTabs.length - 1
    else return
    event.preventDefault()
    const scope = visibleTabs[next].scope
    selectScope(scope)
    document.getElementById(`notes-tab-${scope}`)?.focus()
  }

  const handleCreate = async () => {
    setActionError(null)
    const ok = await createNote(activeScope, draft)
    if (ok) setDrafts(prev => ({ ...prev, [activeScope]: '' }))
    else setActionError('Could not save this note.')
  }

  const handleUpdate = async () => {
    if (!editing) return
    setActionError(null)
    const ok = await updateNote(editing.id, editing.body)
    if (ok) setEditing(null)
    else setActionError('Could not save this note.')
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setActionError(null)
    const ok = await deleteNote(pendingDelete.id)
    setPendingDelete(null)
    if (!ok) setActionError('Could not delete this note.')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Campaign Notes">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-surface-600 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80"
          aria-hidden="true"
          onClick={onClose}
        ></div>
        <div
          ref={dialogRef}
          className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-surface-800"
        >
          <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3 dark:border-surface-700">
            <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">Campaign Notes</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notes"
              className="rounded-md p-1 text-surface-400 hover:text-surface-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Note scopes"
            tabIndex={-1}
            onKeyDown={handleTabKeyDown}
            className="flex gap-1 border-b border-surface-200 px-2 pt-2 dark:border-surface-700"
          >
            {visibleTabs.map(tab => {
              const selected = tab.scope === activeScope
              return (
                <button
                  key={tab.scope}
                  id={`notes-tab-${tab.scope}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="notes-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectScope(tab.scope)}
                  className={`min-h-11 rounded-t-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    selected
                      ? 'bg-white text-primary-700 dark:bg-surface-800 dark:text-primary-300'
                      : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div
            id="notes-panel"
            role="tabpanel"
            aria-labelledby={`notes-tab-${activeScope}`}
            className="flex-1 space-y-4 overflow-y-auto p-4"
          >
            <p className="text-xs text-surface-500 dark:text-surface-400">{description}</p>

            {readOnly && (
              <p role="status" className="rounded-md bg-surface-100 px-3 py-2 text-sm text-surface-700 dark:bg-surface-700 dark:text-surface-200">
                This campaign is archived, so notes are read-only.
              </p>
            )}

            {actionError && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {actionError}
              </p>
            )}

            {!readOnly && (
              <div className="space-y-2">
                <label htmlFor="note-body" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  New note
                </label>
                <textarea
                  id="note-body"
                  value={draft}
                  onChange={event => setDrafts(prev => ({ ...prev, [activeScope]: event.target.value }))}
                  maxLength={MAX_NOTE_LENGTH}
                  rows={4}
                  className="w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-surface-500 dark:text-surface-400">
                    {draft.length}/{MAX_NOTE_LENGTH}
                  </span>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!draft.trim() || draft.trim().length > MAX_NOTE_LENGTH}
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add note
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex justify-center py-8">
                <div
                  role="status"
                  aria-label="Loading notes"
                  className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400"
                />
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
                <p className="text-sm text-red-700 dark:text-red-400">Could not load notes.</p>
                <button
                  type="button"
                  onClick={refetch}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && visibleNotes.length === 0 && (
              <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">{activeTab.empty}</p>
            )}

            {!loading && !error && visibleNotes.length > 0 && (
              <ul className="space-y-3">
                {visibleNotes.map(note => {
                  const mine = note.author_id !== null && note.author_id === myUserId
                  const author = note.author_id ? memberNames.get(note.author_id) ?? 'Former player' : 'Former player'
                  const edited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 1000
                  return (
                    <li key={note.id} className="rounded-md border border-surface-200 p-3 dark:border-surface-700">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-surface-500 dark:text-surface-400">
                        <span className="truncate font-medium text-surface-700 dark:text-surface-300">{author}</span>
                        <span className="flex-shrink-0">
                          {formatNoteDate(note.created_at)}
                          {edited ? ' · edited' : ''}
                        </span>
                      </div>

                      {editing?.id === note.id ? (
                        <div className="space-y-2">
                          <label htmlFor={`note-edit-${note.id}`} className="sr-only">
                            Edit note
                          </label>
                          <textarea
                            id={`note-edit-${note.id}`}
                            value={editing.body}
                            onChange={event => setEditing({ id: note.id, body: event.target.value })}
                            maxLength={MAX_NOTE_LENGTH}
                            rows={4}
                            className="w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="inline-flex min-h-11 items-center justify-center rounded-md border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-50 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleUpdate}
                              disabled={!editing.body.trim() || editing.body.trim().length > MAX_NOTE_LENGTH}
                              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap break-words text-sm text-surface-900 dark:text-surface-100">{note.body}</p>
                          {mine && !readOnly && (
                            <div className="mt-2 flex justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => setEditing({ id: note.id, body: note.body })}
                                className="text-xs font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(note)}
                                className="text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete note?"
          description="This note will be removed for everyone who can see it."
          confirmLabel="Delete note"
          onConfirm={handleDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
