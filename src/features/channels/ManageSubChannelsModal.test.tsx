import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ManageSubChannelsModal } from './ManageSubChannelsModal'
import { ToastProvider } from '../../contexts/ToastContext'
import type { SubChannel } from './useSubChannels'

const room = (over: Partial<SubChannel> = {}): SubChannel => ({
  id: 'r1',
  channel_id: 'c1',
  name: 'OOC',
  is_archived: false,
  status_text: null,
  visibility: 'all',
  allow_dice: true,
  allow_scenes: true,
  allow_npc: true,
  allow_whispers: true,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...over,
})

const renderModal = (props: Partial<Parameters<typeof ManageSubChannelsModal>[0]> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onSetArchived: vi.fn().mockResolvedValue(undefined),
    onSetCapabilities: vi.fn().mockResolvedValue(undefined),
    onSetVisibility: vi.fn().mockResolvedValue(undefined),
    onAddMember: vi.fn().mockResolvedValue(undefined),
    onRemoveMember: vi.fn().mockResolvedValue(undefined),
    members: [],
    roomMembers: {},
    onRemove: vi.fn().mockResolvedValue(undefined),
    onOpenRoom: vi.fn(),
    onRetry: vi.fn(),
  }
  render(
    <ToastProvider>
      <ManageSubChannelsModal
        channelId="c1"
        subChannels={[]}
        archivedRooms={[]}
        loading={false}
        error={null}
        {...handlers}
        {...props}
      />
    </ToastProvider>,
  )
  return { ...handlers, ...props }
}

// Rows are collapsed to a summary line; every inner control lives behind this.
const expandRow = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}

describe('ManageSubChannelsModal', () => {
  it('shows the empty state and lists existing rooms', () => {
    renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    expect(screen.getByText('OOC')).toBeInTheDocument()
    expect(screen.queryByText(/No rooms yet/)).not.toBeInTheDocument()

    renderModal({ subChannels: [] })
    expect(screen.getByText(/No rooms yet/)).toBeInTheDocument()
  })

  it('shows each collapsed row as a summary of audience and enabled features (#775)', () => {
    renderModal({
      subChannels: [
        room({ id: 'r1', name: 'OOC' }),
        room({ id: 'r2', name: 'GM Only', visibility: 'gm', allow_dice: false, allow_whispers: false }),
        room({ id: 'r3', name: 'Secret', visibility: 'private' }),
      ],
      members: [
        { user_id: 'u2', character_name: 'Hero' },
        { user_id: 'u3', character_name: 'Rogue' },
      ],
      roomMembers: { r3: ['u2', 'u3'] },
    })

    expect(screen.getByText('Everyone · Dice, Scenes, NPCs, Whispers')).toBeInTheDocument()
    expect(screen.getByText('Only the GM · Scenes, NPCs')).toBeInTheDocument()
    expect(screen.getByText('2 invited players · Dice, Scenes, NPCs, Whispers')).toBeInTheDocument()
  })

  it('names an empty audience and a room with every feature off (#775)', () => {
    renderModal({
      subChannels: [
        room({
          id: 'r1',
          name: 'Quiet',
          visibility: 'private',
          allow_dice: false,
          allow_scenes: false,
          allow_npc: false,
          allow_whispers: false,
        }),
      ],
      roomMembers: { r1: [] },
    })

    expect(screen.getByText('Invited players (none) · No extra features')).toBeInTheDocument()
  })

  it('keeps the inner controls out of the row until it is expanded (#775)', () => {
    renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })

    expect(screen.queryByRole('button', { name: 'Rename OOC' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Dice in OOC')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Audience for OOC')).not.toBeInTheDocument()

    expandRow('OOC')

    expect(screen.getByRole('button', { name: 'Rename OOC' })).toBeInTheDocument()
    expect(screen.getByLabelText('Dice in OOC')).toBeInTheDocument()
    expect(screen.getByLabelText('Audience for OOC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^OOC/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('expands only one row at a time (#775)', () => {
    renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' }), room({ id: 'r2', name: 'Secret' })],
    })

    expandRow('OOC')
    expect(screen.getByRole('button', { name: 'Rename OOC' })).toBeInTheDocument()

    expandRow('Secret')
    expect(screen.getByRole('button', { name: 'Rename Secret' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename OOC' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^OOC/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses the open row when its summary is clicked again (#775)', () => {
    renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })

    expandRow('OOC')
    expect(screen.getByRole('button', { name: 'Rename OOC' })).toBeInTheDocument()

    expandRow('OOC')
    expect(screen.queryByRole('button', { name: 'Rename OOC' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^OOC/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the room from the manager (#775)', () => {
    const h = renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })

    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Open OOC' }))

    expect(h.onOpenRoom).toHaveBeenCalledWith('r1')
  })

  it('archives and restores rooms', async () => {
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      archivedRooms: [room({ id: 'r2', name: 'Old', is_archived: true })],
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Archive OOC' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledWith('r1', true))

    fireEvent.click(screen.getByRole('button', { name: 'Restore Old' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledWith('r2', false))
  })

  it('deletes an empty room through the inline confirmation', async () => {
    const h = renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Delete OOC' }))
    // Inline, not a second dialog (#775): the manager never stacks a modal.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete room' }))
    await waitFor(() => expect(h.onRemove).toHaveBeenCalledWith('r1'))
  })

  it('surfaces the server refusal when a non-empty room cannot be deleted', async () => {
    renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      onRemove: vi.fn().mockRejectedValue(new Error('This room still has messages. Archive it instead.')),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Delete OOC' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete room' }))
    expect(await screen.findByText('This room still has messages. Archive it instead.')).toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    renderModal({ loading: true })
    expect(screen.queryByText(/No rooms yet/)).not.toBeInTheDocument()
  })

  it('offers Retry when the rooms fetch fails', () => {
    const onRetry = vi.fn()
    renderModal({ error: new Error('boom'), onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renames a room', async () => {
    const h = renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Rename OOC' }))
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Chatter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.onRename).toHaveBeenCalledWith('r1', 'Chatter'))
  })

  it('disables Save until the rename resolves (#775)', async () => {
    const pending = deferred()
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      onRename: vi.fn().mockReturnValue(pending.promise),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Rename OOC' }))
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Chatter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(h.onRename).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    // A second click while in flight sends nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.onRename).toHaveBeenCalledTimes(1)

    pending.resolve()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument())
  })

  it('disables Archive until the request resolves (#775)', async () => {
    const pending = deferred()
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      onSetArchived: vi.fn().mockReturnValue(pending.promise),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Archive OOC' }))

    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Archive OOC' })).toBeDisabled()

    pending.resolve()
  })

  it('disables the delete confirmation until the request resolves (#775)', async () => {
    const pending = deferred()
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      onRemove: vi.fn().mockReturnValue(pending.promise),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Delete OOC' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete room' }))

    await waitFor(() => expect(h.onRemove).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Delete room' })).toBeDisabled()

    pending.resolve()
  })

  it('leaves another room open when an archive finishes (#775)', async () => {
    const pending = deferred()
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' }), room({ id: 'r2', name: 'Dice' })],
      onSetArchived: vi.fn().mockReturnValue(pending.promise),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Archive OOC' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledTimes(1))

    // The GM switches rows while OOC's archive is still in flight.
    expandRow('Dice')
    pending.resolve()

    // Only the archived row closes; the row the GM opened stays open.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Dice' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Rename OOC' })).not.toBeInTheDocument()
  })

  it('keeps Save disabled while another room request is pending (#775)', async () => {
    const pending = deferred()
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      archivedRooms: [room({ id: 'r2', name: 'Old', is_archived: true })],
      onSetArchived: vi.fn().mockReturnValue(pending.promise),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Rename OOC' }))
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Chatter' } })

    fireEvent.click(screen.getByRole('button', { name: 'Restore Old' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledTimes(1))

    // The guarded handler would drop the rename, so the control must look off.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    pending.resolve()
  })

  it('keeps the delete confirmation disabled while another room request is pending (#775)', async () => {
    const pending = deferred()
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      archivedRooms: [room({ id: 'r2', name: 'Old', is_archived: true })],
      onSetArchived: vi.fn().mockReturnValue(pending.promise),
    })
    expandRow('OOC')
    fireEvent.click(screen.getByRole('button', { name: 'Delete OOC' }))

    fireEvent.click(screen.getByRole('button', { name: 'Restore Old' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledTimes(1))

    expect(screen.getByRole('button', { name: 'Delete room' })).toBeDisabled()
    pending.resolve()
  })

  it('toggles a capability flag, sending only the changed flag', async () => {
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC', allow_dice: true, allow_scenes: false })],
    })
    expandRow('OOC')
    fireEvent.click(screen.getByLabelText('Dice in OOC'))
    await waitFor(() => expect(h.onSetCapabilities).toHaveBeenCalledWith('r1', { allow_dice: false }))
  })

  it('sets the room audience (#621 Phase 3)', async () => {
    const h = renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    expandRow('OOC')
    fireEvent.change(screen.getByLabelText('Audience for OOC'), { target: { value: 'private' } })
    await waitFor(() => expect(h.onSetVisibility).toHaveBeenCalledWith('r1', 'private'))
  })

  it('invites a member to a private room (#621 Phase 3)', async () => {
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC', visibility: 'private' })],
      members: [{ user_id: 'u2', character_name: 'Hero' }],
      roomMembers: { r1: [] },
    })
    expandRow('OOC')
    fireEvent.click(screen.getByLabelText('Invite Hero to OOC'))
    await waitFor(() => expect(h.onAddMember).toHaveBeenCalledWith('r1', 'u2'))
  })

  it('removes an invited member (#621 Phase 3)', async () => {
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC', visibility: 'private' })],
      members: [{ user_id: 'u2', character_name: 'Hero' }],
      roomMembers: { r1: ['u2'] },
    })
    expandRow('OOC')
    fireEvent.click(screen.getByLabelText('Invite Hero to OOC'))
    await waitFor(() => expect(h.onRemoveMember).toHaveBeenCalledWith('r1', 'u2'))
  })
})
