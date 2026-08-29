import { defineConfig } from 'vitest/config'
import type { Plugin } from 'rollup'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        buildPlugins: {
          rollup: [swOutputCompat],
        },
      },
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'manifest.json', 'help/*.png'],
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
        branches: 79,
        statements: 80
      }
    }
  }
})

