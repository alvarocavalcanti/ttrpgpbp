import { useRef, useState } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useToast } from '../../contexts/ToastContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { MAX_ROOM_NAME_LENGTH, MAX_ROOMS_PER_CHANNEL } from '../../constants'
import type { RoomCapabilities, RoomVisibility, SubChannel } from './useSubChannels'

interface ManageSubChannelsModalProps {
  channelId: string
  subChannels: SubChannel[]
  archivedRooms: SubChannel[]
  loading: boolean
  error: Error | null
  onClose: () => void
  onCreate: (name: string) => Promise<string>
  onRename: (roomId: string, name: string) => Promise<void>
  onSetArchived: (roomId: string, archived: boolean) => Promise<void>
  onSetCapabilities: (roomId: string, caps: Partial<RoomCapabilities>) => Promise<void>
  onSetVisibility: (roomId: string, visibility: RoomVisibility) => Promise<void>
  onAddMember: (roomId: string, userId: string) => Promise<void>
  onRemoveMember: (roomId: string, userId: string) => Promise<void>
  // Channel members eligible to be invited (excludes the GM, who always sees).
  members: { user_id: string; character_name: string }[]
  // Invited user ids per room.
  roomMembers: Record<string, string[]>
  onRemove: (roomId: string) => Promise<void>
  onOpenRoom: (roomId: string) => void
  onRetry: () => void
}

// The RPC's refusal or a unique violation arrives as a Postgres error message;
// translate the ones a GM will actually hit into player-facing copy.
function friendlyRoomError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/duplicate key|unique/i.test(msg)) return 'A room with that name already exists.'
  return msg
}

// Per-room capability toggles (#621 Phase 2).
const CAPABILITY_FLAGS: { key: keyof RoomCapabilities; label: string }[] = [
  { key: 'allow_dice', label: 'Dice' },
  { key: 'allow_scenes', label: 'Scenes' },
  { key: 'allow_npc', label: 'NPCs' },
  { key: 'allow_whispers', label: 'Whispers' },
]

// GM-only room manager (#621): create, rename, archive/restore, and hard-delete
// empty rooms. All writes are server-owned RPCs; this modal only collects input
// and surfaces their errors.
export function ManageSubChannelsModal({
  subChannels,
  archivedRooms,
  loading,
  error,
  onClose,
  onCreate,
  onRename,
  onSetArchived,
  onSetCapabilities,
  onSetVisibility,
  onAddMember,
  onRemoveMember,
  members,
  roomMembers,
  onRemove,
  onOpenRoom,
  onRetry,
}: ManageSubChannelsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  const { addToast } = useToast()

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<SubChannel | null>(null)

  const canCreate = newName.trim().length > 0 && !creating && subChannels.length < MAX_ROOMS_PER_CHANNEL

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      setCreateError('Enter a room name.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const roomId = await onCreate(name)
      addToast(`Room ${name} created. Everyone in the channel can see it.`, 'success')
      setNewName('')
      onOpenRoom(roomId)
    } catch (err) {
      setCreateError(friendlyRoomError(err))
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (room: SubChannel) => {
    const name = editName.trim()
    if (!name) {
      setActionError('Enter a room name.')
      return
    }
    try {
      await onRename(room.id, name)
      addToast(`Room renamed to ${name}.`, 'success')
      setActionError(null)
    } catch (err) {
      setActionError(friendlyRoomError(err))
    } finally {
      setEditingId(null)
    }
  }

  const handleArchive = async (room: SubChannel, archived: boolean) => {
    try {
      await onSetArchived(room.id, archived)
      addToast(archived ? `Room ${room.name ?? ''} archived.` : `Room ${room.name ?? ''} restored.`, 'success')
      setActionError(null)
    } catch (err) {
      setActionError(friendlyRoomError(err))
    }
  }

  const handleToggleCapability = async (room: SubChannel, key: keyof RoomCapabilities) => {
    try {
      // Send only the toggled flag; update_sub_channel COALESCEs the rest, so a
      // rapid second toggle cannot revert the first through a stale snapshot.
      await onSetCapabilities(room.id, { [key]: !(room[key] ?? true) })
      setActionError(null)
    } catch (err) {
      setActionError(friendlyRoomError(err))
    }
  }

  const handleAudience = async (room: SubChannel, visibility: RoomVisibility) => {
    try {
      await onSetVisibility(room.id, visibility)
      setActionError(null)
    } catch (err) {
      setActionError(friendlyRoomError(err))
    }
  }

  const handleToggleMember = async (room: SubChannel, userId: string) => {
    const invited = (roomMembers[room.id] ?? []).includes(userId)
    try {
      await (invited ? onRemoveMember(room.id, userId) : onAddMember(room.id, userId))
      setActionError(null)
    } catch (err) {
      setActionError(friendlyRoomError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    const room = deleting
    setDeleting(null)
    try {
      await onRemove(room.id)
      addToast(`Room ${room.name ?? ''} deleted.`, 'success')
      setActionError(null)
    } catch (err) {
      setActionError(friendlyRoomError(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-600 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-surface-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="Manage rooms"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">Rooms</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-400 dark:text-surface-400 hover:text-surface-600 p-1"
            aria-label="Close room management"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded flex justify-between items-center">
            <span>{"Couldn't load rooms."}</span>
            <button type="button" onClick={onRetry} className="font-semibold hover:underline">Retry</button>
          </div>
        )}

        {actionError && (
          <div role="alert" className="mb-4 p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse space-y-3 py-1">
            <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-3/4" />
            <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-1/2" />
          </div>
        ) : (
          <>
            {!error && subChannels.length === 0 && (
              <p className="text-sm text-surface-500 dark:text-surface-400 py-2">
                No rooms yet. Add one below to give the table a place for out-of-character chat, dice, or a scene.
              </p>
            )}

            {subChannels.length > 0 && (
              <ul className="space-y-2 mb-4">
                {subChannels.map(room => (
                  <li key={room.id} className="p-2 rounded-md bg-surface-50 dark:bg-surface-900">
                    <div className="flex items-center gap-2">
                    {editingId === room.id ? (
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={MAX_ROOM_NAME_LENGTH}
                          aria-label="Room name"
                          className="flex-1 min-w-0 bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-md text-sm py-1.5 px-3 focus:ring-primary-500 focus:border-primary-500"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(room); if (e.key === 'Escape') setEditingId(null) }}
                        />
                        <button type="button" onClick={() => handleRename(room)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium shrink-0">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs text-surface-500 dark:text-surface-400 hover:underline shrink-0">Cancel</button>
                      </div>
                    ) : (
                      <p className="flex-1 min-w-0 text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{room.name ?? 'Room'}</p>
                    )}
                    {editingId !== room.id && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { setEditingId(room.id); setEditName(room.name ?? '') }}
                          className="min-h-11 px-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                          aria-label={`Rename ${room.name ?? 'room'}`}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(room, true)}
                          className="min-h-11 px-2 text-xs font-medium text-surface-600 dark:text-surface-300 hover:underline"
                          aria-label={`Archive ${room.name ?? 'room'}`}
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(room)}
                          className="min-h-11 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                          aria-label={`Delete ${room.name ?? 'room'}`}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                    </div>
                    <fieldset className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-600 dark:text-surface-300">
                      <legend className="sr-only">Room features for {room.name ?? 'room'}</legend>
                      {CAPABILITY_FLAGS.map(flag => (
                        <label key={flag.key} className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={room[flag.key] ?? true}
                            onChange={() => handleToggleCapability(room, flag.key)}
                            aria-label={`${flag.label} in ${room.name ?? 'room'}`}
                            className="h-4 w-4 rounded border border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
                          />
                          {flag.label}
                        </label>
                      ))}
                    </fieldset>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-600 dark:text-surface-300">
                      <label className="inline-flex items-center gap-1.5">
                        <span>Who can see it:</span>
                        <select
                          value={room.visibility ?? 'all'}
                          onChange={(e) => handleAudience(room, e.target.value as RoomVisibility)}
                          aria-label={`Audience for ${room.name ?? 'room'}`}
                          className="rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 py-1 px-2 text-xs"
                        >
                          <option value="all">Everyone</option>
                          <option value="gm">Only the GM</option>
                          <option value="private">Invited players</option>
                        </select>
                      </label>
                      {(room.visibility ?? 'all') === 'private' && members.map(m => (
                        <label key={m.user_id} className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={(roomMembers[room.id] ?? []).includes(m.user_id)}
                            onChange={() => handleToggleMember(room, m.user_id)}
                            aria-label={`Invite ${m.character_name} to ${room.name ?? 'room'}`}
                            className="h-4 w-4 rounded border border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
                          />
                          {m.character_name}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-surface-100 dark:border-surface-700 pt-4">
              <label htmlFor="new-room-name" className="block text-sm font-semibold text-surface-900 dark:text-surface-100 uppercase tracking-wider mb-2">
                New room
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="new-room-name"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setCreateError(null) }}
                  placeholder="e.g. OOC, Dice, Chapter 1"
                  maxLength={MAX_ROOM_NAME_LENGTH}
                  className="flex-1 min-w-0 w-full bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-md text-sm py-1.5 px-3 focus:ring-primary-500 focus:border-primary-500"
                  onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate() }}
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create room'}
                </button>
              </div>
              {createError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{createError}</p>}
              <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
                {subChannels.length >= MAX_ROOMS_PER_CHANNEL
                  ? `Room limit reached (${MAX_ROOMS_PER_CHANNEL}). Archive or delete a room first.`
                  : `Up to ${MAX_ROOMS_PER_CHANNEL} rooms per channel. Images can only be shared in Main.`}
              </p>
            </div>

            {archivedRooms.length > 0 && (
              <details className="mt-4 border-t border-surface-100 dark:border-surface-700 pt-3">
                <summary className="text-sm font-medium text-surface-600 dark:text-surface-300 cursor-pointer">
                  Archived rooms ({archivedRooms.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {archivedRooms.map(room => (
                    <li key={room.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-surface-50 dark:bg-surface-900">
                      <span className="text-sm text-surface-700 dark:text-surface-300 truncate">{room.name ?? 'Room'}</span>
                      <button
                        type="button"
                        onClick={() => handleArchive(room, false)}
                        className="min-h-11 px-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        aria-label={`Restore ${room.name ?? 'room'}`}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete room ${deleting.name ?? ''}?`}
          description="This can't be undone. Rooms with messages can't be deleted — archive them instead."
          confirmLabel="Delete room"
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
