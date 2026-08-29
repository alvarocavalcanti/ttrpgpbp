import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Shell-level env (e.g. direnv's load_dotenv exporting the project `.env`
// with the remote Supabase URL) takes precedence over Vite's `.env.local`.
// E2E must always run against local Supabase, so .env.local wins here.
function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const localEnv = loadEnvFile('.env.local');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    // If a stale dev server is already on :5173 it gets reused with ITS env —
    // the .env.local override below never reaches it. Kill it first when E2E
    // "still fails locally" against the remote project: `lsof -ti :5173 | xargs kill`.
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, ...localEnv },
  },
});
