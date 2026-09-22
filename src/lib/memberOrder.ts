// Shared member-roster ordering (#571): the GM first, then everyone else by
// character name A-Z case-insensitively — the same base-sensitivity rule the
// mention list uses (#521). Ties fall back to user_id because the DB query
// has no ORDER BY, so the input order can vary between refetches.
export interface OrderableMember {
  user_id: string
  character_name: string
}

export function compareMembers(a: OrderableMember, b: OrderableMember): number {
  return (
    a.character_name.localeCompare(b.character_name, undefined, { sensitivity: 'base' })
    || a.user_id.localeCompare(b.user_id)
  )
}

// Returns a new array; never mutates the input. Without a gmId (or when the
// GM is not in the list) the whole list is sorted by character name.
export function sortMembers<T extends OrderableMember>(members: readonly T[], gmId?: string | null): T[] {
  const rank = gmId ? (m: T) => (m.user_id === gmId ? 0 : 1) : () => 0
  return [...members].sort((a, b) => rank(a) - rank(b) || compareMembers(a, b))
}
