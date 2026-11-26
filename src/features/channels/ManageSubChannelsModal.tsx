import { useRef, useState } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useToast } from '../../contexts/ToastContext'
import { MAX_ROOM_NAME_LENGTH } from '../../constants'
import type { RoomCapabilities, RoomVisibility, SubChannel } from './useSubChannels'
import { CAPABILITY_FLAGS, formatRoomAudience, formatRoomFeatures, friendlyRoomError } from './roomForm'

interface ManageSubChannelsModalProps {
  channelId: string
  subChannels: SubChannel[]
  archivedRooms: SubChannel[]
  loading: boolean
  error: Error | null
  onClose: () => void
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
  // Jump straight into the room (S4, #775). Omitted only by callers with no router.
  onOpenRoom?: (roomId: string) => void
  onRetry: () => void
}

// GM-only room manager (#621). Rename, archive/restore, delete, and the
// per-room toggles; creation lives in its own dialog behind Add room (#774, D9).
// All writes are server-owned RPCs; this modal only collects input and surfaces
// their errors.
//
// #775: rows are collapsed to a summary line (name · audience · features) and
// expand in place, one at a time. There is no third modal — deleting confirms
// inline, so the manager never stacks a dialog on itself (D11).
export function ManageSubChannelsModal({
  subChannels,
  archivedRooms,
  loading,
  error,
  onClose,
  onRename,
  onSetArchived,
  onSetCapabilities,
  onSetVisibility,
  onAddMember,
  onRemoveMember,
  members,
  roomMembers = {},
  onRemove,
  onOpenRoom,
  onRetry,
}: ManageSubChannelsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  const { addToast } = useToast()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Rename, archive/restore and delete disable their triggers while their RPC
  // is in flight, so a double tap cannot send the same write twice (#775). The
  // guard in every handler is global, so the triggers disable globally too — a
  // click that the handler would drop must never look available.
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null)
  const listingBusy = busyRoomId !== null

  // One expanded row at a time: opening another collapses the previous one and
  // drops any inline form it was showing.
  const toggleExpanded = (roomId: string) => {
    setExpandedId(prev => (prev === roomId ? null : roomId))
    setEditingId(null)
    setDeletingId(null)
    setActionError(null)
  }

  const handleRename = async (room: SubChannel) => {
    const name = editName.trim()
    if (!name) {
      setActionError('Enter a room name.')
      return
    }
    if (busyRoomId) return
    setBusyRoomId(room.id)
    try {
      await onRename(room.id, name)
      addToast(`Room renamed to ${name}.`, 'success')
      setActionError(null)
      setEditingId(null)
    } catch (err) {
      // Keep the editor open on a refusal so the GM's text is not lost.
      setActionError(friendlyRoomError(err))
    } finally {
      setBusyRoomId(null)
    }
  }

  const handleArchive = async (room: SubChannel, archived: boolean) => {
    if (busyRoomId) return
    setBusyRoomId(room.id)
    try {
      await onSetArchived(room.id, archived)
      addToast(archived ? `Room ${room.name ?? ''} archived.` : `Room ${room.name ?? ''} restored.`, 'success')
      setActionError(null)
      // Only close the row the request belongs to: the GM may have opened
      // another room while this one was archiving.
      if (archived) setExpandedId(current => (current === room.id ? null : current))
    } catch (err) {
      setActionError(friendlyRoomError(err))
    } finally {
      setBusyRoomId(null)
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
    if (!deletingId) return
    const room = subChannels.find(r => r.id === deletingId)
    if (!room) {
      setDeletingId(null)
      return
    }
    if (busyRoomId) return
    setBusyRoomId(room.id)
    try {
      await onRemove(room.id)
      addToast(`Room ${room.name ?? ''} deleted.`, 'success')
      setActionError(null)
      setDeletingId(null)
      setExpandedId(current => (current === room.id ? null : current))
    } catch (err) {
      setActionError(friendlyRoomError(err))
      setDeletingId(null)
    } finally {
      setBusyRoomId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-600 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg mx-4 max-h-[85dvh] overflow-y-auto overflow-x-hidden rounded-lg bg-white p-4 shadow-xl dark:bg-surface-800 sm:p-6"
        role="dialog"
        aria-label="Manage rooms"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">Rooms</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-surface-400 hover:text-surface-600 dark:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Close room management"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded flex justify-between items-center">
            <span>{"Couldn't load rooms."}</span>
            <button type="button" onClick={onRetry} className="min-h-11 px-2 font-semibold hover:underline">Retry</button>
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
                No rooms yet. Close this window and tap the plus-and-door button in the room bar to make one — a place for out-of-character chat, dice, or a scene.
              </p>
            )}

            {subChannels.length > 0 && (
              <ul className="mb-4 space-y-2">
                {subChannels.map(room => {
                  const expanded = expandedId === room.id
                  const busy = busyRoomId === room.id
                  const invitedCount = (roomMembers[room.id] ?? []).length
                  return (
                    <li key={room.id} className="rounded-md bg-surface-50 dark:bg-surface-900">
                      {/* Summary: name, then audience and enabled features —
                          one line on desktop, two on a phone (#775). */}
                      <button
                        type="button"
                        onClick={() => toggleExpanded(room.id)}
                        aria-expanded={expanded}
                        className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                          <span className="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
                            {room.name ?? 'Room'}
                          </span>
                          <span className="truncate text-xs text-surface-500 dark:text-surface-400">
                            {formatRoomAudience(room.visibility, invitedCount)} · {formatRoomFeatures(room)}
                          </span>
                        </span>
                        <svg
                          className={`h-4 w-4 flex-shrink-0 text-surface-400 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {expanded && (
                        <div className="w-full border-t border-surface-200 px-3 pb-3 pt-3 dark:border-surface-700">
                          {editingId === room.id ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={MAX_ROOM_NAME_LENGTH}
                                aria-label="Room name"
                                disabled={busy}
                                className="min-h-11 min-w-0 flex-1 rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm dark:border-surface-600 dark:bg-surface-800 focus:border-primary-500 focus:ring-primary-500"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(room); if (e.key === 'Escape') setEditingId(null) }}
                              />
                              <button
                                type="button"
                                onClick={() => handleRename(room)}
                                disabled={listingBusy}
                                className="min-h-11 px-3 text-sm font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                disabled={busy}
                                className="min-h-11 px-3 text-sm text-surface-500 hover:underline disabled:opacity-50 dark:text-surface-400"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {onOpenRoom && (
                                <button
                                  type="button"
                                  onClick={() => onOpenRoom(room.id)}
                                  className="min-h-11 px-3 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                                  aria-label={`Open ${room.name ?? 'room'}`}
                                >
                                  Open
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setEditingId(room.id); setEditName(room.name ?? ''); setDeletingId(null) }}
                                disabled={listingBusy}
                                className="min-h-11 px-3 text-sm font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
                                aria-label={`Rename ${room.name ?? 'room'}`}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleArchive(room, true)}
                                disabled={listingBusy}
                                className="min-h-11 px-3 text-sm font-medium text-surface-600 hover:underline disabled:opacity-50 dark:text-surface-300"
                                aria-label={`Archive ${room.name ?? 'room'}`}
                              >
                                Archive
                              </button>
                              <button
                                type="button"
                                onClick={() => { setDeletingId(room.id); setEditingId(null) }}
                                disabled={listingBusy}
                                className="min-h-11 px-3 text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                                aria-label={`Delete ${room.name ?? 'room'}`}
                              >
                                Delete
                              </button>
                            </div>
                          )}

                          {deletingId === room.id && editingId !== room.id && (
                            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-900/30">
                              <p className="font-medium text-red-700 dark:text-red-300">Delete room {room.name ?? ''}?</p>
                              <p className="mt-1 text-red-700 dark:text-red-300">This can't be undone. Rooms with messages can't be deleted — archive them instead.</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={handleDelete}
                                  disabled={listingBusy}
                                  className="min-h-11 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                  Delete room
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  disabled={busy}
                                  className="min-h-11 rounded-md border border-surface-300 px-3 text-sm font-medium text-surface-700 disabled:opacity-50 dark:border-surface-600 dark:text-surface-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          <fieldset className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-surface-600 dark:text-surface-300">
                            <legend className="sr-only">Room features for {room.name ?? 'room'}</legend>
                            {CAPABILITY_FLAGS.map(flag => (
                              <label key={flag.key} className="inline-flex min-h-11 items-center gap-2">
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

                          <div className="mt-3 flex flex-col gap-2 text-sm text-surface-600 dark:text-surface-300">
                            <label className="flex min-h-11 items-center gap-2">
                              <span>Who can see it:</span>
                              <select
                                value={room.visibility ?? 'all'}
                                onChange={(e) => handleAudience(room, e.target.value as RoomVisibility)}
                                aria-label={`Audience for ${room.name ?? 'room'}`}
                                className="min-h-11 rounded border border-surface-300 bg-white px-2 py-1.5 text-sm dark:border-surface-600 dark:bg-surface-800"
                              >
                                <option value="all">Everyone</option>
                                <option value="gm">Only the GM</option>
                                <option value="private">Invited players</option>
                              </select>
                            </label>
                            {(room.visibility ?? 'all') === 'private' && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                {members.map(m => (
                                  <label key={m.user_id} className="inline-flex min-h-11 items-center gap-2">
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
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {archivedRooms.length > 0 && (
              <details className="mt-4 border-t border-surface-100 dark:border-surface-700 pt-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-surface-600 dark:text-surface-300">
                  Archived rooms ({archivedRooms.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {archivedRooms.map(room => (
                    <li key={room.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-50 p-2 dark:bg-surface-900">
                      <span className="truncate text-sm text-surface-700 dark:text-surface-300">{room.name ?? 'Room'}</span>
                      <button
                        type="button"
                        onClick={() => handleArchive(room, false)}
                        disabled={listingBusy}
                        className="min-h-11 px-3 text-sm font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
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
    </div>
  )
}
