import { describe, it, expect } from 'vitest'
import { titleForPath } from './routeTitles'

describe('titleForPath', () => {
  it('names each app route instead of falling back to the bare brand', () => {
    // DAMP literals: an accidental change to the map must break these rather
    // than silently re-flatten the Pages report.
    expect(titleForPath('/', true)).toBe('Lobby — Role by Post')
    expect(titleForPath('/settings', true)).toBe('Settings — Role by Post')
    expect(titleForPath('/admin', true)).toBe('Server Admin — Role by Post')
    expect(titleForPath('/archived', true)).toBe('Archived Channels — Role by Post')
    expect(titleForPath('/messages', true)).toBe('Messages — Role by Post')
    expect(titleForPath('/about', true)).toBe('About — Role by Post')
    expect(titleForPath('/changelog', true)).toBe('Changelog — Role by Post')
    expect(titleForPath('/login', true)).toBe('Sign in — Role by Post')
  })

  it('splits the two pages that share /', () => {
    // '/' is the signed-out landing page and the signed-in lobby. Resolving it
    // from the path alone filed every signed-out visit under the lobby.
    expect(titleForPath('/', false)).toBe('Role by Post — Play-by-Post RPG Chat')
    expect(titleForPath('/', true)).toBe('Lobby — Role by Post')
  })

  it('matches the app routes that take a parameter', () => {
    expect(titleForPath('/channel/abc-123', true)).toBe('Channel — Role by Post')
    expect(titleForPath('/admin/channels/abc-123', true)).toBe('Channel — Role by Post')
    expect(titleForPath('/join/abc-123', true)).toBe('Join a Channel — Role by Post')
  })

  it('does not let a shorter pattern swallow a longer path', () => {
    // '/channel/:id' must not match this: the channel room deep link is its own
    // route, and both are anchored.
    expect(titleForPath('/channel/abc-123/sub/room-1', true)).toBe('Channel — Role by Post')
    expect(titleForPath('/channel/abc-123/extra', true)).toBe('Page not found — Role by Post')
  })

  it('falls through to the public routes, which already carry the brand', () => {
    expect(titleForPath('/features', false)).toBe('Features — Role by Post')
    expect(titleForPath('/press', false)).toBe('Press Kit — Role by Post')
    expect(titleForPath('/directory', false)).toBe('Games Looking for Players — Role by Post')
    // Help topics keep their own suffix.
    expect(titleForPath('/help/dice-rolling', false)).toBe('Dice Rolling — Role by Post Help')
  })

  it('normalizes a trailing slash, and titles an unmatched path as not found', () => {
    expect(titleForPath('/settings/', true)).toBe('Settings — Role by Post')
    // An unmatched path renders the not-found screen, which titles itself so.
    expect(titleForPath('/nothing-here', true)).toBe('Page not found — Role by Post')
    expect(titleForPath('/nothing-here', false)).toBe('Page not found — Role by Post')
  })
})
