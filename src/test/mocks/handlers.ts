import { http, HttpResponse } from 'msw'
import { env } from '../../env'

const supabaseUrl = env.VITE_SUPABASE_URL || 'http://localhost:54321'

export const handlers = [
  // Mock profile updates
  http.patch(`${supabaseUrl}/rest/v1/profiles`, async () => {
    return HttpResponse.json({}, { status: 200 })
  }),
  
  // Add other handlers as needed
]

