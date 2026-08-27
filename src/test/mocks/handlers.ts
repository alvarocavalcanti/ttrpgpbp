import { http, HttpResponse } from 'msw'
import { env } from '../../env'

const supabaseUrl = env.VITE_SUPABASE_URL || 'http://localhost:54321'

// MSW runs with onUnhandledRequest: 'error' (src/test/setup.ts). These
// handlers cover the REST/RPC endpoints a component may hit when a test
// renders through a partially-mocked Supabase client, so a stray request
// resolves cleanly instead of failing the suite as "unhandled". Empty shapes
// are safe defaults; tests that assert on data mock the client instead.
export const handlers = [
  // Profile updates
  http.patch(`${supabaseUrl}/rest/v1/profiles`, async () => {
    return HttpResponse.json({}, { status: 200 })
  }),

  // Table reads
  http.get(`${supabaseUrl}/rest/v1/app_settings`, async () => {
    return HttpResponse.json([])
  }),
  http.get(`${supabaseUrl}/rest/v1/channel_npcs`, async () => {
    return HttpResponse.json([])
  }),
  http.post(`${supabaseUrl}/rest/v1/push_subscriptions`, async () => {
    return HttpResponse.json([])
  }),
  http.patch(`${supabaseUrl}/rest/v1/push_subscriptions`, async () => {
    return HttpResponse.json([])
  }),

  // RPCs
  http.post(`${supabaseUrl}/rest/v1/rpc/get_channel_roll_history`, async () => {
    return HttpResponse.json([])
  }),
  http.post(`${supabaseUrl}/rest/v1/rpc/get_admin_unread_count`, async () => {
    return HttpResponse.json(0)
  }),
  http.post(`${supabaseUrl}/rest/v1/rpc/join_channel`, async () => {
    return HttpResponse.json({ success: true })
  }),
]