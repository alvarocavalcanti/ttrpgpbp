import { existsSync, readFileSync } from 'node:fs';
import { Page } from '@playwright/test';

// A fresh session has never seen the changelog, so the What's New dialog
// overlays the lobby and intercepts clicks. Wait for it briefly, then dismiss
// it when present. Bounded so a session that has already seen it (or one where
// the dialog is slow to render) does not stall or fail.
export async function dismissWhatsNew(page: Page) {
  const dialog = page.getByRole('dialog', { name: "What's new" });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
  } catch {
    // Dialog never appeared for this session — nothing to dismiss.
  }
}

// Mirrors the loader in playwright.config.ts: shell-level VITE_* exports (e.g.
// direnv pointing at the remote project) must not win over .env.local — E2E
// always runs against local Supabase.
function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const localEnv = loadEnvFile('.env.local');

// SUPABASE_URL/SERVICE_ROLE_KEY come from the shell (CI exports them from
// `supabase status -o env`, which prints the values double-quoted); locally
// fall back to the .env.local URL. The service-role key itself is never
// committed — it must be exported by the caller (fail closed, never guess).
const unquote = (v: string | undefined) => v?.replace(/^["']|["']$/g, '') ?? '';
const supabaseUrl = unquote(process.env.SUPABASE_URL) || unquote(process.env.VITE_SUPABASE_URL) || unquote(localEnv.VITE_SUPABASE_URL);
const serviceRoleKey = unquote(process.env.SUPABASE_SERVICE_ROLE_KEY);

export const TEST_PASSWORD = 'Password123!';

// Seeds a confirmed email/password user through the Supabase Admin API
// (service role). This replaces the old sign-up-via-page.evaluate harness
// (issue #403 ARCH-7): seeding is deterministic and independent of the app
// bundle and of email-confirmation timing.
export async function seedUser(email: string, password: string = TEST_PASSWORD): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'E2E seeding needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment ' +
      '(CI exports them from `supabase status -o env`; locally run `export $(npx supabase status -o env | grep SERVICE_ROLE_KEY)`).'
    );
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  const error = (body.msg || body.message || body.error_description || body.error || `HTTP ${res.status}`) as string;
  return { ok: false, error };
}

// Signs the seeded user in through the app's own client (exposed in dev for
// E2E) so the session is stored exactly where the app expects it and the
// SIGNED_IN event drives the redirect to the lobby.
export async function signIn(page: Page, email: string, password: string = TEST_PASSWORD) {
  const error = await page.evaluate(async ({ email, password }) => {
    // @ts-expect-error - exposed in dev for E2E
    const client = window.__supabase;
    if (!client) throw new Error('Supabase client not found on window');
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, { email, password });
  if (error) throw new Error(`Sign-in failed: ${error}`);
}

// Convenience: seed a fresh user and sign in from the login page.
export async function seedAndSignIn(page: Page, email: string, password: string = TEST_PASSWORD) {
  const seeded = await seedUser(email, password);
  if (!seeded.ok) throw new Error(`Seeding ${email} failed: ${seeded.error}`);
  await page.goto('/login');
  await signIn(page, email, password);
  await page.waitForURL('/');
}
