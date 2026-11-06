import { toError } from '../../lib/errors'
import type { RoomCapabilities, RoomVisibility } from './useSubChannels'

// Per-room capability toggles (#621 Phase 2), shared by the create dialog and
// the manager so both name and order the same features.
export const CAPABILITY_FLAGS: { key: keyof RoomCapabilities; label: string }[] = [
  { key: 'allow_dice', label: 'Dice' },
  { key: 'allow_scenes', label: 'Scenes' },
  { key: 'allow_npc', label: 'NPCs' },
  { key: 'allow_whispers', label: 'Whispers' },
]

export const DEFAULT_ROOM_CAPABILITIES: RoomCapabilities = {
  allow_dice: true,
  allow_scenes: true,
  allow_npc: true,
  allow_whispers: true,
}

// The RPC's refusal or a unique violation arrives as a Postgres error message;
// translate the ones a GM will actually hit into player-facing copy. Supabase
// errors are plain objects, not Error instances, so normalize first — reading
// String(err) would show the GM "[object Object]".
export function friendlyRoomError(err: unknown): string {
  const msg = toError(err).message
  if (/duplicate key|unique/i.test(msg)) return 'A room with that name already exists.'
  return msg
}

// The creation toast names who can see the room (#774). It must never claim
// "everyone" for a restricted room — the old hardcoded string was the bug.
export function roomCreatedMessage(visibility: RoomVisibility, invitedCount: number): string {
  if (visibility === 'gm') return 'Only you can see it.'
  if (visibility === 'private') {
    if (invitedCount === 0) return 'No players invited — only you can see it.'
    return invitedCount === 1
      ? 'Visible to 1 invited player.'
      : `Visible to ${invitedCount} invited players.`
  }
  return 'Everyone in the channel can see it.'
}
