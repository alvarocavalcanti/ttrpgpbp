// Help-screenshot capture (committed tooling, #465/#497).
//
// Captures the help images in public/help/ at the size/format the existing
// files use: 360×780 CSS viewport at deviceScaleFactor 3 (→ 1080×2340), light
// mode, mobile touch profile.
//
// Prereqs:
//   1. Local Supabase running + migrations applied.
//   2. Seed the screenshot fixtures:
//        PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
//          -f scripts/help-screenshots/seed.sql
//   3. Dev server running (`npm run dev`) with a local `.env.local`.
//
// Run:  node scripts/help-screenshots/capture.mjs
// Output: public/help/*.png (overwritten).
import { chromium } from '@playwright/test'
import { readFileSync, rmSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:5173'
const OUT = process.env.SHOT_OUT || 'public/help'
const PROFILE_DIR = process.env.SHOT_PROFILE_DIR || '/tmp/ttrpg-pw-profile'
const PASS = 'shots-pass-1'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').trim().split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

async function getSession(email) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: PASS }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(body).slice(0, 200)}`)
  return body
}

const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
const KEY = `sb-${ref}-auth-token`

// Fresh profile every run: a persisted userDataDir would leak theme, text
// size, "what's new seen" and session state from a previous run, which would
// silently change the captured images. colorScheme pins prefers-color-scheme
// to light so the app can't fall back to dark.
rmSync(PROFILE_DIR, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
})

const page = await ctx.newPage()
page.setDefaultTimeout(15000)

async function loginAs(email) {
  const session = await getSession(email)
  await ctx.clearCookies()
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, value)
  }, [KEY, JSON.stringify(session)])
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await dismissOverlays()
}

// The What's New modal (and any other one-shot overlay) can intercept clicks.
async function dismissOverlays() {
  const close = page.getByRole('button', { name: 'Close' })
  if (await close.count()) {
    await close.first().click().catch(() => {})
    await page.waitForTimeout(400)
  }
}

// Close every open sheet. Some flows stack two (composer options opened, then
// a dice roller / check sheet nested on top), and one Escape only pops the
// topmost — the leftover backdrop would then swallow later clicks.
async function closeSheets() {
  for (let i = 0; i < 4; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
}

async function openChannel() {
  await page.getByText('The Sunless Citadel').first().click()
  await page.waitForURL('**/channel/**')
  await page.getByText('The ancient grove opens').first().waitFor()
  await page.waitForTimeout(1500)
  await dismissOverlays()
}

// ── 1. Empty lobby (fresh user, no channels) ─────────────────────────────
await loginAs('shot.new@local.test')
await page.screenshot({ path: `${OUT}/lobby-empty.png` })
console.log('lobby-empty done')

// ── 2. GM lobby with channels (GM chip, sender preview, unread pill) ─────
await loginAs('shot.gm@local.test')
await page.getByText('The Sunless Citadel').first().waitFor()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/lobby-with-channels.png` })
console.log('lobby-with-channels done')

// ── 3. Channel view ──────────────────────────────────────────────────────
await openChannel()
await page.screenshot({ path: `${OUT}/status-bar.png` })
console.log('status-bar done')

// ── 4. Sidebar ───────────────────────────────────────────────────────────
await page.click('[aria-label="Toggle sidebar menu"]')
await page.waitForSelector('[data-testid="sidebar-menu"]')
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/sidebar.png` })
console.log('sidebar done')

// ── 5. GM settings (from sidebar) ────────────────────────────────────────
await page.getByRole('button', { name: 'Settings' }).last().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/gm-settings.png` })
console.log('gm-settings done')
await closeSheets()

// ── 6. Safety tools ──────────────────────────────────────────────────────
await page.click('[aria-label="Toggle sidebar menu"]')
await page.waitForTimeout(400)
await page.getByText('Safety Tools').last().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/safety-tools.png` })
console.log('safety-tools done')
await closeSheets()

// ── 7. Composer options + NPC mode ───────────────────────────────────────
await page.click('[aria-label="Toggle options"]')
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/npc-composer.png` })
console.log('npc-composer done')
await closeSheets()

// ── 8. Dice roller bottom sheet ──────────────────────────────────────────
await page.click('[aria-label="Toggle options"]')
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Roll Dice' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/dice-panel.png` })
console.log('dice-panel done')
await closeSheets()

// ── 9. Ability check sheet ───────────────────────────────────────────────
await page.locator('[title="Roll DEX Check (DC 12)"]').first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/ability-check.png` })
console.log('ability-check done')
await closeSheets()

// ── 10. Message action sheet ─────────────────────────────────────────────
const actions = page.locator('[aria-label="Message actions"]').first()
await actions.scrollIntoViewIfNeeded()
await actions.click({ timeout: 20000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/message-actions.png` })
console.log('message-actions done')

await ctx.close()
console.log('ALL DONE')
