import { describe, it, expect } from 'vitest'
import { linkifyMentions } from './mentions'

const MEMBERS = [
  { user_id: 'u1', character_name: 'Hero' },
  { user_id: 'u2', character_name: 'Bob the Bold' },
  { user_id: 'u3', character_name: 'Bobby' },
]

describe('linkifyMentions', () => {
  it('links a single mention', () => {
    const { content, mentioned_user_ids } = linkifyMentions('Hey @Hero', MEMBERS)
    expect(content).toBe('Hey [@Hero](user:u1)')
    expect(mentioned_user_ids).toEqual(['u1'])
  })

  it('links multi-word character names', () => {
    const { content, mentioned_user_ids } = linkifyMentions('@Bob the Bold rolls', MEMBERS)
    expect(content).toBe('[@Bob the Bold](user:u2) rolls')
    expect(mentioned_user_ids).toEqual(['u2'])
  })

  it('links multiple distinct mentions', () => {
    const { content, mentioned_user_ids } = linkifyMentions('@Hero and @Bobby', MEMBERS)
    expect(content).toBe('[@Hero](user:u1) and [@Bobby](user:u3)')
    expect([...mentioned_user_ids].sort()).toEqual(['u1', 'u3'])
  })

  it('does not match prefix names (overlapping names)', () => {
    const { content, mentioned_user_ids } = linkifyMentions('@Bobby', MEMBERS)
    expect(content).toBe('[@Bobby](user:u3)')
    expect(mentioned_user_ids).toEqual(['u3'])
  })

  it('does not link unknown names', () => {
    const { content, mentioned_user_ids } = linkifyMentions('@Nobody here', MEMBERS)
    expect(content).toBe('@Nobody here')
    expect(mentioned_user_ids).toEqual([])
  })

  it('leaves mention mid-word alone', () => {
    const { content, mentioned_user_ids } = linkifyMentions('email@Hero.com', MEMBERS)
    expect(content).toBe('email@Hero.com')
    expect(mentioned_user_ids).toEqual([])
  })

  it('handles mention followed by punctuation', () => {
    const { content, mentioned_user_ids } = linkifyMentions('Great job, @Hero!', MEMBERS)
    expect(content).toBe('Great job, [@Hero](user:u1)!')
    expect(mentioned_user_ids).toEqual(['u1'])
  })

  it('ignores empty character names', () => {
    const { content, mentioned_user_ids } = linkifyMentions('@Foo', [{ user_id: 'u9', character_name: '' }])
    expect(content).toBe('@Foo')
    expect(mentioned_user_ids).toEqual([])
  })

  it('collapses duplicate character names to the first member', () => {
    const dupes = [
      { user_id: 'u1', character_name: 'Bob' },
      { user_id: 'u2', character_name: 'Bob' },
    ]
    const { content, mentioned_user_ids } = linkifyMentions('@Bob', dupes)
    expect(content).toBe('[@Bob](user:u1)')
    expect(mentioned_user_ids).toEqual(['u1'])
  })

  it('returns unchanged text when no members', () => {
    const { content, mentioned_user_ids } = linkifyMentions('Hello @Hero', [])
    expect(content).toBe('Hello @Hero')
    expect(mentioned_user_ids).toEqual([])
  })

  it('links @all to every member when enabled', () => {
    const { content, mentioned_user_ids } = linkifyMentions('Roll init @all', MEMBERS, { allMentionEnabled: true })
    expect(content).toBe('Roll init [@all](user:all)')
    expect(mentioned_user_ids).toEqual(['u1', 'u2', 'u3'])
  })

  it('leaves @all alone when not enabled', () => {
    const { content, mentioned_user_ids } = linkifyMentions('Roll init @all', MEMBERS)
    expect(content).toBe('Roll init @all')
    expect(mentioned_user_ids).toEqual([])
  })

  it('handles @all followed by punctuation', () => {
    const { content, mentioned_user_ids } = linkifyMentions('Alright, @all!', MEMBERS, { allMentionEnabled: true })
    expect(content).toBe('Alright, [@all](user:all)!')
    expect(mentioned_user_ids).toEqual(['u1', 'u2', 'u3'])
  })

  it('leaves @all mid-word alone', () => {
    const { content, mentioned_user_ids } = linkifyMentions('info@all.com', MEMBERS, { allMentionEnabled: true })
    expect(content).toBe('info@all.com')
    expect(mentioned_user_ids).toEqual([])
  })

  it('dedupes ids when @all and an explicit mention overlap', () => {
    const { content, mentioned_user_ids } = linkifyMentions('@all see @Hero', MEMBERS, { allMentionEnabled: true })
    expect(content).toBe('[@all](user:all) see [@Hero](user:u1)')
    expect(mentioned_user_ids).toEqual(['u1', 'u2', 'u3'])
  })
})
