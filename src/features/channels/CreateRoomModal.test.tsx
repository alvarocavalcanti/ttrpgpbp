import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { CreateRoomModal } from './CreateRoomModal'
import { ToastProvider } from '../../contexts/ToastContext'

const members = [
  { user_id: 'p1', character_name: 'Hero' },
  { user_id: 'p2', character_name: 'Rogue' },
]

const renderModal = (props: Partial<Parameters<typeof CreateRoomModal>[0]> = {}) => {
  const handlers = {
    existingActiveRoomCount: 0,
    isArchived: false,
    members,
    membersLoading: false,
    membersError: null,
    onRetryMembers: vi.fn(),
    onCreate: vi.fn().mockResolvedValue('new-room'),
    onCreated: vi.fn(),
    onClose: vi.fn(),
  }
  render(
    <ToastProvider>
      <CreateRoomModal {...handlers} {...props} />
    </ToastProvider>,
  )
  return { ...handlers, ...props }
}

const fillName = (value: string) =>
  fireEvent.change(screen.getByLabelText('Room name'), { target: { value } })

describe('CreateRoomModal', () => {
  it('starts with an empty name, every feature on and Everyone selected', () => {
    renderModal()
    expect(screen.getByLabelText('Room name')).toHaveValue('')
    for (const label of ['Dice', 'Scenes', 'NPCs', 'Whispers']) {
      expect(screen.getByLabelText(label)).toBeChecked()
    }
    expect(screen.getByLabelText('Everyone')).toBeChecked()
    expect(screen.queryByLabelText('Hero')).not.toBeInTheDocument()
  })

  it('creates a room with the features picked in the form', async () => {
    const h = renderModal()
    fillName('Dice Only')
    fireEvent.click(screen.getByLabelText('Dice'))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalled())
    expect(h.onCreate).toHaveBeenCalledWith('Dice Only', {
      allow_dice: false,
      allow_scenes: true,
      allow_npc: true,
      allow_whispers: true,
    }, 'all', [])
  })

  it('moves focus into the name field and gives it back to + Room on Escape', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <ToastProvider>
          <button type="button" onClick={() => setOpen(true)}>Add room</button>
          {open && (
            <CreateRoomModal
              existingActiveRoomCount={0}
              isArchived={false}
              members={members}
              membersLoading={false}
              membersError={null}
              onRetryMembers={vi.fn()}
              onCreate={vi.fn()}
              onCreated={vi.fn()}
              onClose={() => setOpen(false)}
            />
          )}
        </ToastProvider>
      )
    }
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Add room' })
    // jsdom does not move focus on click the way a browser does.
    trigger.focus()
    fireEvent.click(trigger)
    // The name field gets focus only after the trap captured + Room, so the
    // dialog has somewhere to give focus back to.
    expect(screen.getByLabelText('Room name')).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add room' })).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'Create room' })).not.toBeInTheDocument()
  })

  it('refuses to send a player who is no longer in the game', async () => {
    const { rerender } = render(
      <ToastProvider>
        <CreateRoomModal
          existingActiveRoomCount={0}
          isArchived={false}
          members={members}
          membersLoading={false}
          membersError={null}
          onRetryMembers={vi.fn()}
          onCreate={vi.fn().mockResolvedValue('new-room')}
          onCreated={vi.fn()}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Secret' } })
    fireEvent.click(screen.getByLabelText('Invited players'))
    fireEvent.click(screen.getByLabelText('Hero'))

    // The roster changed under the open dialog (the player left or got blocked).
    const onCreate = vi.fn().mockResolvedValue('new-room')
    rerender(
      <ToastProvider>
        <CreateRoomModal
          existingActiveRoomCount={0}
          isArchived={false}
          members={[{ user_id: 'p2', character_name: 'Rogue' }]}
          membersLoading={false}
          membersError={null}
          onRetryMembers={vi.fn()}
          onCreate={onCreate}
          onCreated={vi.fn()}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    expect(await screen.findByText('Some invited players are no longer in this game. Choose who to invite again.')).toBeInTheDocument()
    expect(onCreate).not.toHaveBeenCalled()
    // The stale pick is dropped so a second click cannot resend it.
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate).toHaveBeenCalledWith('Secret', expect.any(Object), 'private', [])
  })

  it('shows the server refusal for a structured Postgres error', async () => {
    // Supabase hands back a plain object, not an Error instance.
    const h = renderModal({
      onCreate: vi.fn().mockRejectedValue({
        message: 'duplicate key value violates unique constraint "sub_channels_channel_lower_name_idx"',
        code: '23505',
      }),
    })
    fillName('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    expect(await screen.findByText('A room with that name already exists.')).toBeInTheDocument()
    expect(h.onCreated).not.toHaveBeenCalled()
  })

  it('reveals the player checklist only for Invited players', () => {
    renderModal()
    fireEvent.click(screen.getByLabelText('Invited players'))
    expect(screen.getByLabelText('Hero')).toBeInTheDocument()
    expect(screen.getByLabelText('Rogue')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Everyone'))
    expect(screen.queryByLabelText('Hero')).not.toBeInTheDocument()
  })

  it('creates a private room with its players in one call', async () => {
    const h = renderModal()
    fillName('  Secret  ')
    fireEvent.click(screen.getByLabelText('Invited players'))
    fireEvent.click(screen.getByLabelText('Hero'))
    fireEvent.click(screen.getByLabelText('Rogue'))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalledWith('new-room'))
    expect(h.onCreate).toHaveBeenCalledTimes(1)
    expect(h.onCreate).toHaveBeenCalledWith('Secret', {
      allow_dice: true,
      allow_scenes: true,
      allow_npc: true,
      allow_whispers: true,
    }, 'private', ['p1', 'p2'])
    expect(await screen.findByText('Room Secret created. Visible to 2 invited players.')).toBeInTheDocument()
  })

  it('never claims everyone for a private room with one player', async () => {
    const h = renderModal()
    fillName('Secret')
    fireEvent.click(screen.getByLabelText('Invited players'))
    fireEvent.click(screen.getByLabelText('Hero'))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalled())
    expect(await screen.findByText('Room Secret created. Visible to 1 invited player.')).toBeInTheDocument()
  })

  it('allows a private room with no players yet', async () => {
    const h = renderModal()
    fillName('Secret')
    fireEvent.click(screen.getByLabelText('Invited players'))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalled())
    expect(h.onCreate).toHaveBeenCalledWith('Secret', expect.any(Object), 'private', [])
    expect(await screen.findByText('Room Secret created. No players invited — only you can see it.')).toBeInTheDocument()
  })

  it('names the audience for a everyone room, never a restricted one', async () => {
    const h = renderModal()
    fillName('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalled())
    expect(h.onCreate).toHaveBeenCalledWith('OOC', expect.any(Object), 'all', [])
    expect(await screen.findByText('Room OOC created. Everyone in the channel can see it.')).toBeInTheDocument()
  })

  it('names the audience for a GM-only room', async () => {
    const h = renderModal()
    fillName('Notes')
    fireEvent.click(screen.getByLabelText('Only the GM'))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalled())
    expect(await screen.findByText('Room Notes created. Only you can see it.')).toBeInTheDocument()
  })

  it('drops the player pick when the audience is not private', async () => {
    const h = renderModal()
    fillName('OOC')
    fireEvent.click(screen.getByLabelText('Invited players'))
    fireEvent.click(screen.getByLabelText('Hero'))
    fireEvent.click(screen.getByLabelText('Only the GM'))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreated).toHaveBeenCalled())
    expect(h.onCreate).toHaveBeenCalledWith('OOC', expect.any(Object), 'gm', [])
  })

  it('rejects a blank name inline without calling the RPC', () => {
    const h = renderModal()
    fillName('   ')
    fireEvent.submit(screen.getByLabelText('Room name').closest('form')!)

    expect(screen.getByText('Enter a room name.')).toBeInTheDocument()
    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('caps the name at 40 characters at the input', () => {
    renderModal()
    expect(screen.getByLabelText('Room name')).toHaveAttribute('maxLength', '40')
  })

  it('surfaces a friendly message for a duplicate name and stays open', async () => {
    const h = renderModal({
      onCreate: vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint')),
    })
    fillName('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    expect(await screen.findByText('A room with that name already exists.')).toBeInTheDocument()
    expect(h.onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create room' })).toBeEnabled()
  })

  it('shows the server message when the failure is not an Error', async () => {
    renderModal({ onCreate: vi.fn().mockRejectedValue('Room limit reached (10). Delete a room first.') })
    fillName('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    expect(await screen.findByText('Room limit reached (10). Delete a room first.')).toBeInTheDocument()
  })

  it('shows a loading state while the roster resolves', () => {
    renderModal({ membersLoading: true })
    fillName('Secret')
    fireEvent.click(screen.getByLabelText('Invited players'))
    expect(screen.getByRole('status')).toHaveTextContent('Loading players…')
    expect(screen.queryByLabelText('Hero')).not.toBeInTheDocument()
    // An empty, still-loading checklist must not save a private room with
    // nobody invited.
    expect(screen.getByRole('button', { name: 'Create room' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Everyone'))
    expect(screen.getByRole('button', { name: 'Create room' })).toBeEnabled()
  })

  it('offers Retry when the roster fails to load', () => {
    const h = renderModal({ membersError: new Error('boom') })
    fireEvent.click(screen.getByLabelText('Invited players'))
    expect(screen.getByText("Couldn't load players.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(h.onRetryMembers).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when nobody can be invited', () => {
    renderModal({ members: [] })
    fireEvent.click(screen.getByLabelText('Invited players'))
    expect(screen.getByText(/No players to invite yet/)).toBeInTheDocument()
  })

  it('blocks creation at the room cap', () => {
    renderModal({ existingActiveRoomCount: 10 })
    fillName('OOC')
    expect(screen.getByText('Room limit reached (10). Archive or delete a room first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create room' })).toBeDisabled()
  })

  it('blocks creation in an archived channel', () => {
    renderModal({ isArchived: true })
    fillName('OOC')
    expect(screen.getByText(/This channel is archived/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create room' })).toBeDisabled()
  })

  it('closes on Escape', () => {
    const h = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(h.onClose).toHaveBeenCalledTimes(1)
  })

  it('issues one call even when the button is clicked twice', async () => {
    let resolveCreate: (id: string) => void = () => {}
    const onCreate = vi.fn().mockReturnValue(new Promise<string>(resolve => { resolveCreate = resolve }))
    const h = renderModal({ onCreate })

    fillName('OOC')
    const submit = screen.getByRole('button', { name: 'Create room' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(onCreate).toHaveBeenCalledTimes(1)
    resolveCreate('new-room')
    await waitFor(() => expect(h.onCreated).toHaveBeenCalledWith('new-room'))
  })
})
