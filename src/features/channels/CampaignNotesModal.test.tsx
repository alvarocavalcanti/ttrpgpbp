import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CampaignNotesModal } from './CampaignNotesModal'
import { useChannelNotes } from './useChannelNotes'

vi.mock('./useChannelNotes', () => ({
  useChannelNotes: vi.fn(),
}))

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  channel_id: 'c1',
  author_id: 'u1',
  scope: 'party',
  body: 'shared clue',
  created_at: '2026-10-26T10:00:00Z',
  updated_at: '2026-10-26T10:00:00Z',
  ...over,
})

const members = [
  { user_id: 'u1', character_name: 'Aria' },
  { user_id: 'u2', character_name: 'Player Two' },
]

function mockNotes(over: Record<string, unknown> = {}) {
  const createNote = vi.fn().mockResolvedValue(true)
  const updateNote = vi.fn().mockResolvedValue(true)
  const deleteNote = vi.fn().mockResolvedValue(true)
  const refetch = vi.fn()
  vi.mocked(useChannelNotes).mockReturnValue({
    notes: [note()],
    loading: false,
    error: null,
    refetch,
    createNote,
    updateNote,
    deleteNote,
    ...over,
  } as never)
  return { createNote, updateNote, deleteNote, refetch }
}

function renderModal(over: Record<string, unknown> = {}) {
  return render(
    <CampaignNotesModal
      channelId="c1"
      initialScope="party"
      isGM={false}
      readOnly={false}
      members={members}
      myUserId="u1"
      onClose={vi.fn()}
      {...over}
    />,
  )
}

describe('CampaignNotesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotes()
  })

  it('shows character and party tabs to players, never GM notes', () => {
    renderModal()
    expect(screen.getByRole('tab', { name: 'Character Notes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Party Notes' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'GM Notes' })).not.toBeInTheDocument()
  })

  it('shows the GM tab to the GM', () => {
    renderModal({ isGM: true })
    expect(screen.getByRole('tab', { name: 'GM Notes' })).toBeInTheDocument()
  })

  it('opens on the clicked scope and filters to it', () => {
    mockNotes({
      notes: [note({ id: 'n1', scope: 'character', body: 'private' }), note({ id: 'n2', body: 'party' })],
    })
    renderModal({ initialScope: 'character' })
    expect(screen.getByRole('tab', { name: 'Character Notes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('private')).toBeInTheDocument()
    expect(screen.queryByText('party')).not.toBeInTheDocument()
  })

  it('trims a new note and clears the draft', async () => {
    const { createNote } = mockNotes()
    renderModal()
    const input = screen.getByLabelText('New note')
    fireEvent.change(input, { target: { value: '  table clue  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    await waitFor(() => expect(createNote).toHaveBeenCalledWith('party', '  table clue  '))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('caps input at 4000 characters and blocks blank notes', () => {
    renderModal()
    const input = screen.getByLabelText('New note')
    expect(input).toHaveAttribute('maxLength', '4000')
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled()
  })

  it('shows an empty state for the active scope', () => {
    mockNotes({ notes: [] })
    renderModal()
    expect(screen.getByText('No party notes yet.')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    mockNotes({ loading: true })
    renderModal()
    expect(screen.getByLabelText('Loading notes')).toBeInTheDocument()
  })

  it('shows a retryable fetch error', () => {
    const { refetch } = mockNotes({ error: new Error('down') })
    renderModal()
    expect(screen.getByText(/Could not load notes/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('is read-only on an archived campaign', () => {
    renderModal({ readOnly: true })
    expect(screen.getByText(/archived, so notes are read-only/)).toBeInTheDocument()
    expect(screen.queryByLabelText('New note')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('only offers edit and delete on your own notes', () => {
    mockNotes({
      notes: [note({ id: 'n1', author_id: 'u2', body: 'not mine' })],
    })
    renderModal()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('edits your own note', async () => {
    const { updateNote } = mockNotes()
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const input = screen.getByLabelText('Edit note')
    fireEvent.change(input, { target: { value: '  changed  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateNote).toHaveBeenCalledWith('n1', '  changed  '))
  })

  it('deletes your own note after confirmation', async () => {
    const { deleteNote } = mockNotes()
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete note?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))

    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith('n1'))
  })

  it('renders note text literally, including HTML and markdown characters', () => {
    mockNotes({ notes: [note({ body: '**bold** <script>alert(1)</script>' })] })
    renderModal()
    const body = screen.getByText('**bold** <script>alert(1)</script>')
    expect(body).toBeInTheDocument()
    expect(body.querySelector('script')).toBeNull()
  })

  it('marks only a real edit, not the insert-time timestamp drift', () => {
    mockNotes({
      notes: [
        note({ id: 'n1', created_at: '2026-10-26T10:00:00Z', updated_at: '2026-10-26T10:00:00.005Z' }),
        note({ id: 'n2', created_at: '2026-10-26T10:00:00Z', updated_at: '2026-10-26T10:05:00Z' }),
      ],
    })
    renderModal()
    expect(screen.getAllByText(/· edited/)).toHaveLength(1)
  })

  it('labels a deleted author as a former player', () => {
    mockNotes({ notes: [note({ author_id: null })] })
    renderModal()
    expect(screen.getByText('Former player')).toBeInTheDocument()
  })

  it('uses the character name for an author', () => {
    renderModal()
    expect(screen.getByText('Aria')).toBeInTheDocument()
  })
})
