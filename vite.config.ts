import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'rollup'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Single source of truth for the app version, surfaced in the About page.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// vite-plugin-pwa hardcodes `output.inlineDynamicImports` for the service-worker
// build; rolldown (vite 8) deprecates that in favour of `codeSplitting: false`.
// Swap it via an outputOptions hook — identical behavior, no deprecation warning.
const swOutputCompat: Plugin = {
  name: 'pwa-sw-output-compat',
  outputOptions(options) {
    if (!('inlineDynamicImports' in options)) return null
    const { inlineDynamicImports: _dropped, ...rest } = options
    return { ...rest, codeSplitting: false } as typeof options
  },
}

export default defineConfig(({ command, mode }) => {
  // #601: the PWA update flow verifies the reload actually landed on the new
  // build (src/lib/pwaUpdate.ts). GITHUB_SHA is deterministic per CI commit;
  // local builds fall back to a timestamp so every local build is distinct.
  const appBuild = process.env.GITHUB_SHA ?? String(Date.now())
  // #562: production bundles must name the data controller (GDPR Art 13).
  // Fail the build loudly rather than shipping a bundle whose policies
  // render a generic line with no contact. Dev/test builds stay optional.
  if (command === 'build') {
    // Shell env first, then .env files — Vite's own precedence, so both
    // dashboard-exported and file-based setups are honored.
    const fileEnv = loadEnv(mode, process.cwd())
    const missing = ['VITE_CONTROLLER_NAME', 'VITE_CONTROLLER_EMAIL'].filter(
      (key) => !(process.env[key] || fileEnv[key]),
    )
    if (missing.length > 0) {
      throw new Error(
        `Missing required production env vars: ${missing.join(', ')}. See DEPLOYMENT.md.`,
      )
    }
  }

  return {
  define: {
    __APP_BUILD__: JSON.stringify(appBuild),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectManifest: {
        // No bare `png` here: it would precache every help screenshot
        // (~3.4 MiB). Help images load from the network on first visit.
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        buildPlugins: {
          rollup: [swOutputCompat],
        },
      },
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'manifest.json'],
      manifest: false,
    })
  ],
  test: {
    globals: true,
    alias: {
      'npm:zod@^4': 'zod',
      'npm:zod': 'zod',
    },
    exclude: ['**/node_modules/**', '**/dist/**', '**/.idea/**', '**/.git/**', '**/.cache/**', 'tests/e2e/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.test.tsx',
        'src/**/*.test.ts',
        'src/test/**',
        'supabase/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 81,
        statements: 80
      }
    }
  }
  }
})

