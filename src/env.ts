import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  VITE_VAPID_PUBLIC_KEY: z.string().optional().or(z.literal('')),
  VITE_GA_MEASUREMENT_ID: z.string().min(1).optional().or(z.literal(''))
})

export const env = envSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_VAPID_PUBLIC_KEY: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  VITE_GA_MEASUREMENT_ID: import.meta.env.VITE_GA_MEASUREMENT_ID
})
