// Shared lobby/list formatting helpers (#674). Kept out of Lobby.tsx so the
// Discover detail sheet can reuse them without importing the page.

import { GAME_SYSTEM_OPTIONS } from '../../game-systems'

// Display name for a channel's game system id ('none' = generic).
export function gameSystemLabel(id: string | null | undefined): string {
  return GAME_SYSTEM_OPTIONS.find((option) => option.id === id)?.name ?? 'None (Generic)'
}

// Short lobby timestamp (WhatsApp-style): HH:MM if the message is from today,
// DD/MM/YYYY otherwise. Formatted manually (not locale/time-zone dependent) so
// the 24-hour HH:MM is stable across browsers.
export function channelTimestamp(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}
