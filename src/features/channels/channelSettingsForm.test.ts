import { describe, it, expect } from 'vitest'
import type { Database } from '../../types/database'
import {
  TAB_FIELDS,
  TAB_IDS,
  TAB_LABELS,
  dirtyKeys,
  initialForm,
  tabForField,
  type ChannelSettingsForm,
} from './channelSettingsForm'

type Channel = Database['public']['Tables']['channels']['Row']

const channel: Channel = {
  id: 'c1',
  name: 'Game Room',
  game_system: 'shadowdark',
  map_url: 'http://map',
  resources_url: 'http://resources',
  safety_tools_url: 'http://safety',
  gm_id: 'gm1',
  invite_code: '123',
  is_archived: false,
  join_mode: 'approval',
  description: 'A weekly game.',
  constraints: 'Be kind.',
  application_prompt: 'Why?',
  avatar_url: null,
  last_message_at: null,
  last_message_preview: null,
  listing_takedown_at: null,
  status_text: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('initialForm', () => {
  it('copies the channel row into the form', () => {
    const form = initialForm(channel, 'https://gm-only')

    expect(form).toMatchObject({
      name: 'Game Room',
      gameSystem: 'shadowdark',
      mapUrl: 'http://map',
      resourcesUrl: 'http://resources',
      gmOnlyResourcesUrl: 'https://gm-only',
      safetyToolsUrl: 'http://safety',
      joinMode: 'approval',
      description: 'A weekly game.',
      constraints: 'Be kind.',
      applicationPrompt: 'Why?',
      changePassword: false,
      newPassword: '',
    })
  })

  it('falls back for a sparse row', () => {
    const form = initialForm(
      {
        ...channel,
        game_system: '',
        map_url: null,
        resources_url: null,
        safety_tools_url: null,
        description: null,
        constraints: null,
        application_prompt: null,
      },
      null,
    )

    expect(form.gameSystem).toBe('none')
    expect(form.mapUrl).toBe('')
    expect(form.resourcesUrl).toBe('')
    expect(form.gmOnlyResourcesUrl).toBe('')
    expect(form.safetyToolsUrl).toBe('')
    expect(form.description).toBe('')
    expect(form.constraints).toBe('')
    expect(form.applicationPrompt).toBe('')
  })

  it('returns a fresh object each time', () => {
    const a = initialForm(channel, null)
    a.name = 'changed'

    expect(initialForm(channel, null).name).toBe('Game Room')
  })
})

describe('dirtyKeys', () => {
  const baseline = initialForm(channel, null)

  it('is empty for an untouched form', () => {
    expect(dirtyKeys({ ...baseline }, baseline).size).toBe(0)
  })

  it('reports a single edited field', () => {
    const dirty = dirtyKeys({ ...baseline, name: 'New Name' }, baseline)

    expect([...dirty]).toEqual(['name'])
  })

  it('reports the password toggle and the new password', () => {
    const dirty = dirtyKeys({ ...baseline, changePassword: true, newPassword: 'secret' }, baseline)

    expect(dirty.has('changePassword')).toBe(true)
    expect(dirty.has('newPassword')).toBe(true)
  })
})

describe('tabs', () => {
  it('lists the five tabs in order with labels', () => {
    expect(TAB_IDS).toEqual(['general', 'resources', 'safety', 'listing', 'applications'])
    expect(TAB_LABELS).toEqual({
      general: 'General',
      resources: 'Resources',
      safety: 'Safety',
      listing: 'Listing',
      applications: 'Applications',
    })
  })

  it('gives the applications tab no persisted field of its own', () => {
    expect(TAB_FIELDS.applications).toEqual([])
  })

  it('places every form field in exactly one tab', () => {
    const keys = Object.keys(initialForm(channel, null)) as (keyof ChannelSettingsForm)[]
    const placed = TAB_IDS.flatMap(id => TAB_FIELDS[id])

    expect(placed.sort()).toEqual([...keys].sort())
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('resolves the tab that shows a field', () => {
    expect(tabForField('name')).toBe('general')
    expect(tabForField('mapUrl')).toBe('resources')
    expect(tabForField('safetyToolsUrl')).toBe('safety')
    expect(tabForField('description')).toBe('listing')
  })
})
