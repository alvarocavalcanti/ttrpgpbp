import { describe, it, expect } from 'vitest'
import { supabaseUrl } from './handlers'

// MSW runs with onUnhandledRequest: 'error'. These smoke tests pin the shape
// each registered handler returns so a stray component request through a
// partially-mocked client resolves cleanly instead of failing the suite.
describe('msw handlers', () => {
  it('mocks profile patches', async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles`, { method: 'PATCH' })
    expect(res.status).toBe(200)
  })

  it('returns empty tables for app_settings and channel_npcs', async () => {
    expect(await fetch(`${supabaseUrl}/rest/v1/app_settings`).then(r => r.json())).toEqual([])
    expect(await fetch(`${supabaseUrl}/rest/v1/channel_npcs`).then(r => r.json())).toEqual([])
  })

  it('resolves push_subscriptions upserts', async () => {
    expect(await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, { method: 'POST' }).then(r => r.json())).toEqual([{ id: 'mock-subscription' }])
    expect(await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, { method: 'PATCH' }).then(r => r.json())).toEqual([{ id: 'mock-subscription' }])
  })

  it('resolves RPC endpoints', async () => {
    expect(await fetch(`${supabaseUrl}/rest/v1/rpc/get_channel_roll_history`, { method: 'POST' }).then(r => r.json())).toEqual([])
    expect(await fetch(`${supabaseUrl}/rest/v1/rpc/get_admin_unread_count`, { method: 'POST' }).then(r => r.json())).toBe(0)
    expect(await fetch(`${supabaseUrl}/rest/v1/rpc/join_channel`, { method: 'POST' }).then(r => r.json())).toEqual({ success: true })
  })
})