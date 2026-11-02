import type { Database } from '../../types/database'

type Channel = Database['public']['Tables']['channels']['Row']

export type ChannelSettingsTab = 'general' | 'resources' | 'safety' | 'listing'

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
  // Gates the optional safety fields on save (they are only sent once the GM
  // has looked at them). It is not an edit, so it never marks the form dirty.
  safetyToolsLoaded: boolean
}

export const TAB_IDS: ChannelSettingsTab[] = ['general', 'resources', 'safety', 'listing']

export const TAB_LABELS: Record<ChannelSettingsTab, string> = {
  general: 'General',
  resources: 'Resources',
  safety: 'Safety',
  listing: 'Listing',
}

// Every persisted key belongs to exactly one tab, so the dirty dot and the
// validation jump can both resolve a field to the tab that shows it.
export const TAB_FIELDS: Record<ChannelSettingsTab, (keyof ChannelSettingsForm)[]> = {
  general: ['name', 'gameSystem', 'changePassword', 'newPassword'],
  resources: ['mapUrl', 'resourcesUrl', 'gmOnlyResourcesUrl'],
  safety: ['safetyToolsUrl', 'safetyLines', 'safetyVeils', 'safetyToolsLoaded'],
  listing: ['joinMode', 'description', 'constraints', 'applicationPrompt'],
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
    safetyToolsLoaded: false,
  }
}

// Derived, never stored: a key counts as dirty when it differs from what the
// server last accepted. safetyToolsLoaded is bookkeeping, not an edit.
export function dirtyKeys(
  form: ChannelSettingsForm,
  baseline: ChannelSettingsForm,
): Set<keyof ChannelSettingsForm> {
  const dirty = new Set<keyof ChannelSettingsForm>()
  for (const key of Object.keys(form) as (keyof ChannelSettingsForm)[]) {
    if (key === 'safetyToolsLoaded') continue
    if (form[key] !== baseline[key]) dirty.add(key)
  }
  return dirty
}

export function tabForField(field: keyof ChannelSettingsForm): ChannelSettingsTab {
  const tab = TAB_IDS.find(id => TAB_FIELDS[id].includes(field))
  // Every form key is placed; the fallback keeps the caller total.
  return tab ?? 'general'
}
