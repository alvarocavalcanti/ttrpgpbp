import { describe, it, expect } from 'vitest'
import { compareMembers, sortMembers } from './memberOrder'

describe('memberOrder', () => {
  it('sorts by character name case-insensitively', () => {
    const members = [
      { user_id: 'u1', character_name: 'Zara' },
      { user_id: 'u2', character_name: 'arden' },
      { user_id: 'u3', character_name: 'Bobby' },
    ]
    expect(sortMembers(members).map(m => m.character_name)).toEqual(['arden', 'Bobby', 'Zara'])
  })

  it('pins the GM first even when the GM name sorts last', () => {
    const members = [
      { user_id: 'u1', character_name: 'arden' },
      { user_id: 'u2', character_name: 'Zara' },
      { user_id: 'u3', character_name: 'Bobby' },
    ]
    expect(sortMembers(members, 'u2').map(m => m.character_name)).toEqual(['Zara', 'arden', 'Bobby'])
  })

  it('falls back to name order when the GM is not in the list or no gmId is given', () => {
    const members = [
      { user_id: 'u1', character_name: 'Zara' },
      { user_id: 'u2', character_name: 'arden' },
    ]
    const expected = ['arden', 'Zara']
    expect(sortMembers(members, 'u9').map(m => m.character_name)).toEqual(expected)
    expect(sortMembers(members, null).map(m => m.character_name)).toEqual(expected)
    expect(sortMembers(members).map(m => m.character_name)).toEqual(expected)
  })

  it('breaks name ties deterministically by user_id', () => {
    const members = [
      { user_id: 'u2', character_name: 'Hero' },
      { user_id: 'u1', character_name: 'Hero' },
    ]
    const expected = ['u1', 'u2']
    expect(sortMembers(members).map(m => m.user_id)).toEqual(expected)
    expect(sortMembers(members).map(m => m.user_id)).toEqual(expected)
  })

  it('does not mutate the input array', () => {
    const members = [
      { user_id: 'u1', character_name: 'Zara' },
      { user_id: 'u2', character_name: 'arden' },
    ]
    const result = sortMembers(members)
    expect(result).not.toBe(members)
    expect(members.map(m => m.character_name)).toEqual(['Zara', 'arden'])
  })

  it('returns an empty array for an empty input', () => {
    expect(sortMembers([], 'u1')).toEqual([])
  })

  it('exposes a comparator that ignores case', () => {
    expect(compareMembers({ user_id: 'a', character_name: 'bobby' }, { user_id: 'b', character_name: 'Arden' })).toBeGreaterThan(0)
    // Same user_id so the user_id fallback cannot decide: names differing
    // only by case must compare equal.
    expect(compareMembers({ user_id: 'a', character_name: 'arden' }, { user_id: 'a', character_name: 'Arden' })).toBe(0)
  })
})
