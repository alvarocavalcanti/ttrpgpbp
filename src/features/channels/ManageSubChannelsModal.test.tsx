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
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...over,
})

const renderModal = (props: Partial<Parameters<typeof ManageSubChannelsModal>[0]> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onCreate: vi.fn().mockResolvedValue('new-room'),
    onRename: vi.fn().mockResolvedValue(undefined),
    onSetArchived: vi.fn().mockResolvedValue(undefined),
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
  return handlers
}

describe('ManageSubChannelsModal', () => {
  it('shows the empty state and lists existing rooms', () => {
    renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    expect(screen.getByText('OOC')).toBeInTheDocument()
    expect(screen.queryByText(/No rooms yet/)).not.toBeInTheDocument()

    renderModal({ subChannels: [] })
    expect(screen.getByText(/No rooms yet/)).toBeInTheDocument()
  })

  it('creates a room with a trimmed name and opens it', async () => {
    const h = renderModal()
    fireEvent.change(screen.getByLabelText('New room'), { target: { value: '  OOC  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    await waitFor(() => expect(h.onCreate).toHaveBeenCalledWith('OOC'))
    expect(h.onOpenRoom).toHaveBeenCalledWith('new-room')
  })

  it('rejects an empty name inline without calling the RPC', async () => {
    const h = renderModal()
    // Bypass the disabled button to exercise the guard.
    fireEvent.change(screen.getByLabelText('New room'), { target: { value: '   ' } })
    const input = screen.getByLabelText('New room') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('surfaces a friendly message for a duplicate name', async () => {
    const h = renderModal({ onCreate: vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint')) })
    fireEvent.change(screen.getByLabelText('New room'), { target: { value: 'OOC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))

    expect(await screen.findByText('A room with that name already exists.')).toBeInTheDocument()
    expect(h.onOpenRoom).not.toHaveBeenCalled()
  })

  it('archives and restores rooms', async () => {
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      archivedRooms: [room({ id: 'r2', name: 'Old', is_archived: true })],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Archive OOC' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledWith('r1', true))

    fireEvent.click(screen.getByRole('button', { name: 'Restore Old' }))
    await waitFor(() => expect(h.onSetArchived).toHaveBeenCalledWith('r2', false))
  })

  it('deletes an empty room through the confirm dialog', async () => {
    const h = renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Delete OOC' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete room' }))
    await waitFor(() => expect(h.onRemove).toHaveBeenCalledWith('r1'))
  })

  it('surfaces the server refusal when a non-empty room cannot be deleted', async () => {
    const h = renderModal({
      subChannels: [room({ id: 'r1', name: 'OOC' })],
      onRemove: vi.fn().mockRejectedValue(new Error('This room still has messages. Archive it instead.')),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete OOC' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete room' }))
    expect(await screen.findByText('This room still has messages. Archive it instead.')).toBeInTheDocument()
    expect(h.onOpenRoom).not.toHaveBeenCalled()
  })

  it('shows a skeleton while loading', () => {
    renderModal({ loading: true })
    expect(screen.queryByLabelText('New room')).not.toBeInTheDocument()
  })

  it('offers Retry when the rooms fetch fails', () => {
    const onRetry = vi.fn()
    renderModal({ error: new Error('boom'), onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renames a room', async () => {
    const h = renderModal({ subChannels: [room({ id: 'r1', name: 'OOC' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Rename OOC' }))
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Chatter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.onRename).toHaveBeenCalledWith('r1', 'Chatter'))
  })
})
