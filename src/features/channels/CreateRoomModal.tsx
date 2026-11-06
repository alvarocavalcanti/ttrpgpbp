import { useEffect, useRef, useState } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useToast } from '../../contexts/ToastContext'
import { trackEvent } from '../../lib/analytics'
import { MAX_ROOM_NAME_LENGTH, MAX_ROOMS_PER_CHANNEL } from '../../constants'
import type { RoomCapabilities, RoomVisibility } from './useSubChannels'
import {
  CAPABILITY_FLAGS,
  DEFAULT_ROOM_CAPABILITIES,
  friendlyRoomError,
  roomCreatedMessage,
} from './roomForm'

interface CreateRoomModalProps {
  // Active rooms already in the channel; the server enforces the same cap.
  existingActiveRoomCount: number
  isArchived: boolean
  // Channel members eligible to be invited (the caller excludes the GM and
  // blocked players).
  members: { user_id: string; character_name: string }[]
  membersLoading: boolean
  membersError: Error | null
  onRetryMembers: () => void
  onCreate: (
    name: string,
    caps: RoomCapabilities,
    visibility: RoomVisibility,
    memberIds: string[],
  ) => Promise<string>
  onCreated: (roomId: string) => void
  onClose: () => void
}

// Create-only room dialog (#774). The gear keeps the manager (S4 restyles it),
// so name, features and audience are all collected here in one pass and sent as
// a single RPC — never a create-then-invite chain.
export function CreateRoomModal({
  existingActiveRoomCount,
  isArchived,
  members,
  membersLoading,
  membersError,
  onRetryMembers,
  onCreate,
  onCreated,
  onClose,
}: CreateRoomModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  // Focus the name field only AFTER useFocusTrap has captured the element that
  // opened the dialog (the + Room chip). `autoFocus` would run during commit,
  // before the trap's effect, so Escape would have nobody to restore focus to.
  useEffect(() => {
    nameInputRef.current?.focus({ preventScroll: true })
  }, [])
  const { addToast } = useToast()

  const [name, setName] = useState('')
  const [caps, setCaps] = useState<RoomCapabilities>(DEFAULT_ROOM_CAPABILITIES)
  const [visibility, setVisibility] = useState<RoomVisibility>('all')
  const [invitedIds, setInvitedIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atCap = existingActiveRoomCount >= MAX_ROOMS_PER_CHANNEL
  // A private room cannot be created while the roster is still loading: the
  // checklist is empty, so the GM would save a room with nobody invited.
  const rosterPending = visibility === 'private' && membersLoading
  const canCreate = name.trim().length > 0 && !creating && !atCap && !isArchived && !rosterPending

  const toggleInvite = (userId: string) => {
    setInvitedIds(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a room name.')
      return
    }
    if (!canCreate) return

    setCreating(true)
    setError(null)
    // Only a private room carries invites; a stale pick is dropped here and
    // again by the server.
    const sentIds = visibility === 'private' ? invitedIds : []
    if (visibility === 'private') {
      // The roster can change while the dialog is open (a player leaves or is
      // blocked). Inviting them would make the whole server call fail, so stop
      // and let the GM re-pick instead of silently dropping them.
      const eligible = new Set(members.map(m => m.user_id))
      if (sentIds.some(id => !eligible.has(id))) {
        setInvitedIds(sentIds.filter(id => eligible.has(id)))
        setCreating(false)
        setError('Some invited players are no longer in this game. Choose who to invite again.')
        return
      }
    }
    try {
      const roomId = await onCreate(trimmed, caps, visibility, sentIds)
      trackEvent('room_create', { audience: visibility, invited: sentIds.length })
      addToast(`Room ${trimmed} created. ${roomCreatedMessage(visibility, sentIds.length)}`)
      onCreated(roomId)
    } catch (err) {
      setError(friendlyRoomError(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-600 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-surface-800"
        role="dialog"
        aria-label="Create room"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">New room</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-surface-400 hover:text-surface-600 dark:text-surface-400"
            aria-label="Close create room"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="create-room-name" className="mb-1 block text-sm font-medium text-surface-900 dark:text-surface-100">
            Room name
          </label>
          <input
            id="create-room-name"
            ref={nameInputRef}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            placeholder="e.g. OOC, Dice, Chapter 1"
            maxLength={MAX_ROOM_NAME_LENGTH}
            className="w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-800"
          />

          <fieldset className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-surface-600 dark:text-surface-300">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">Features</legend>
            {CAPABILITY_FLAGS.map(flag => (
              <label key={flag.key} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={caps[flag.key]}
                  onChange={() => setCaps(prev => ({ ...prev, [flag.key]: !prev[flag.key] }))}
                  className="h-4 w-4 rounded border border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
                />
                {flag.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="mt-4">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">Who can see it</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-700 dark:text-surface-300">
              {([
                { value: 'all', label: 'Everyone' },
                { value: 'gm', label: 'Only the GM' },
                { value: 'private', label: 'Invited players' },
              ] as { value: RoomVisibility; label: string }[]).map(option => (
                <label key={option.value} className="inline-flex min-h-11 items-center gap-1.5">
                  <input
                    type="radio"
                    name="room-audience"
                    value={option.value}
                    checked={visibility === option.value}
                    onChange={() => setVisibility(option.value)}
                    className="h-4 w-4 border border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          {visibility === 'private' && (
            <div className="mt-3 rounded-md bg-surface-50 p-3 dark:bg-surface-900">
              {membersLoading ? (
                <p className="text-sm text-surface-500 dark:text-surface-400" role="status">Loading players…</p>
              ) : membersError ? (
                <div role="alert" className="flex items-center justify-between gap-3 text-sm text-red-700 dark:text-red-300">
                  <span>{"Couldn't load players."}</span>
                  <button type="button" onClick={onRetryMembers} className="font-semibold hover:underline">Retry</button>
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-surface-500 dark:text-surface-400">
                  No players to invite yet. Players join the game with its invite code.
                </p>
              ) : (
                <ul className="space-y-1">
                  {members.map(member => (
                    <li key={member.user_id}>
                      <label className="inline-flex min-h-11 items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
                        <input
                          type="checkbox"
                          checked={invitedIds.includes(member.user_id)}
                          onChange={() => toggleInvite(member.user_id)}
                          className="h-4 w-4 rounded border border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
                        />
                        {member.character_name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isArchived ? (
            <p className="mt-4 text-xs text-surface-500 dark:text-surface-400">
              This channel is archived and can no longer receive new rooms.
            </p>
          ) : atCap && (
            <p className="mt-4 text-xs text-surface-500 dark:text-surface-400">
              Room limit reached ({MAX_ROOMS_PER_CHANNEL}). Archive or delete a room first.
            </p>
          )}

          {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
