import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  VITE_VAPID_PUBLIC_KEY: z.string().optional().or(z.literal('')),
  VITE_GA_MEASUREMENT_ID: z.string().min(1).optional().or(z.literal('')),
  // Data-controller identity for the privacy policy / terms footer (#562).
  // Required in production builds (GDPR Art 13): a production bundle with no
  // named controller and no contact would ship non-compliant. Optional
  // elsewhere so local dev, tests, and clone-and-deploy experiments build —
  // unset renders a generic line and omits the contact email.
  VITE_CONTROLLER_NAME: import.meta.env.PROD
    ? z.string().min(1, 'VITE_CONTROLLER_NAME is required for production builds (see DEPLOYMENT.md)')
    : z.string().min(1).optional().or(z.literal('')),
  VITE_CONTROLLER_EMAIL: import.meta.env.PROD
    ? z.string().email('VITE_CONTROLLER_EMAIL must be a valid email for production builds (see DEPLOYMENT.md)')
    : z.string().email().optional().or(z.literal('')),
})

export const env = envSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_VAPID_PUBLIC_KEY: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  VITE_GA_MEASUREMENT_ID: import.meta.env.VITE_GA_MEASUREMENT_ID,
  VITE_CONTROLLER_NAME: import.meta.env.VITE_CONTROLLER_NAME,
  VITE_CONTROLLER_EMAIL: import.meta.env.VITE_CONTROLLER_EMAIL,
})
