/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build id injected via `define` in vite.config.ts (issue #601): the PWA
// update flow compares this against the last-seen build to verify an update
// reload actually landed.
declare const __APP_BUILD__: string

// App version injected via `define` in vite.config.ts from package.json,
// surfaced in the About page.
declare const __APP_VERSION__: string
