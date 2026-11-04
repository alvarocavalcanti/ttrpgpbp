import type { Database } from '../../types/database'

type Channel = Database['public']['Tables']['channels']['Row']

export type ChannelSettingsTab = 'general' | 'resources' | 'safety' | 'listing' | 'applications'

export interface ChannelSettingsForm {
  name: string
  gameSystem: string
  mapUrl: string
  resourcesUrl: string
  gmOnlyResourcesUrl: string
  safetyToolsUrl: string
  safetyLines: string
  safetyVeils: string
  joinMode: Channel['join_mode']
  description: string
  constraints: string
  applicationPrompt: string
  changePassword: boolean
  newPassword: string
}

export const TAB_IDS: ChannelSettingsTab[] = ['general', 'resources', 'safety', 'listing', 'applications']

export const TAB_LABELS: Record<ChannelSettingsTab, string> = {
  general: 'General',
  resources: 'Resources',
  safety: 'Safety',
  listing: 'Listing',
  applications: 'Applications',
}

// Every persisted key belongs to exactly one tab, so the dirty dot and the
// validation jump can both resolve a field to the tab that shows it. The
// applications tab owns no persisted field: it renders the join-request queue.
export const TAB_FIELDS: Record<ChannelSettingsTab, (keyof ChannelSettingsForm)[]> = {
  general: ['name', 'gameSystem', 'changePassword', 'newPassword'],
  resources: ['mapUrl', 'resourcesUrl', 'gmOnlyResourcesUrl'],
  safety: ['safetyToolsUrl', 'safetyLines', 'safetyVeils'],
  listing: ['joinMode', 'description', 'constraints', 'applicationPrompt'],
  applications: [],
}

export function initialForm(channel: Channel, gmOnlyResourcesUrl: string | null): ChannelSettingsForm {
  return {
    name: channel.name,
    gameSystem: channel.game_system || 'none',
    mapUrl: channel.map_url || '',
    resourcesUrl: channel.resources_url || '',
    gmOnlyResourcesUrl: gmOnlyResourcesUrl || '',
    safetyToolsUrl: channel.safety_tools_url || '',
    safetyLines: '',
    safetyVeils: '',
    joinMode: channel.join_mode,
    description: channel.description ?? '',
    constraints: channel.constraints ?? '',
    applicationPrompt: channel.application_prompt ?? '',
    changePassword: false,
    newPassword: '',
  }
}

// Derived, never stored: a key counts as dirty when it differs from what the
// server last accepted.
export function dirtyKeys(
  form: ChannelSettingsForm,
  baseline: ChannelSettingsForm,
): Set<keyof ChannelSettingsForm> {
  const dirty = new Set<keyof ChannelSettingsForm>()
  for (const key of Object.keys(form) as (keyof ChannelSettingsForm)[]) {
    if (form[key] !== baseline[key]) dirty.add(key)
  }
  return dirty
}

export function tabForField(field: keyof ChannelSettingsForm): ChannelSettingsTab {
  const tab = TAB_IDS.find(id => TAB_FIELDS[id].includes(field))
  // Every form key is placed; the fallback keeps the caller total.
  return tab ?? 'general'
}
