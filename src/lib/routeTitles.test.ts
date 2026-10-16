import { describe, it, expect } from 'vitest'
import { titleForPath } from './routeTitles'

describe('titleForPath', () => {
  it('names each app route instead of falling back to the bare brand', () => {
    // DAMP literals: an accidental change to the map must break these rather
    // than silently re-flatten the Pages report.
    expect(titleForPath('/')).toBe('Lobby — Role by Post')
    expect(titleForPath('/settings')).toBe('Settings — Role by Post')
    expect(titleForPath('/admin')).toBe('Server Admin — Role by Post')
    expect(titleForPath('/archived')).toBe('Archived Channels — Role by Post')
    expect(titleForPath('/messages')).toBe('Messages — Role by Post')
    expect(titleForPath('/about')).toBe('About — Role by Post')
    expect(titleForPath('/changelog')).toBe('Changelog — Role by Post')
    expect(titleForPath('/login')).toBe('Sign in — Role by Post')
  })

  it('matches the app routes that take a parameter', () => {
    expect(titleForPath('/channel/abc-123')).toBe('Channel — Role by Post')
    expect(titleForPath('/admin/channels/abc-123')).toBe('Channel — Role by Post')
    expect(titleForPath('/join/abc-123')).toBe('Join a Channel — Role by Post')
  })

  it('does not let a shorter pattern swallow a longer path', () => {
    // '/channel/:id' must not match this: the channel room deep link is its own
    // route, and both are anchored.
    expect(titleForPath('/channel/abc-123/sub/room-1')).toBe('Channel — Role by Post')
    expect(titleForPath('/channel/abc-123/extra')).toBe('Role by Post')
  })

  it('falls through to the public routes, which already carry the brand', () => {
    expect(titleForPath('/features')).toBe('Features — Role by Post')
    expect(titleForPath('/press')).toBe('Press Kit — Role by Post')
    expect(titleForPath('/directory')).toBe('Games Looking for Players — Role by Post')
    // Help topics keep their own suffix.
    expect(titleForPath('/help/dice-rolling')).toBe('Dice Rolling — Role by Post Help')
  })

  it('normalizes a trailing slash, and defaults an unknown path', () => {
    expect(titleForPath('/settings/')).toBe('Settings — Role by Post')
    expect(titleForPath('/nothing-here')).toBe('Role by Post')
  })
})
