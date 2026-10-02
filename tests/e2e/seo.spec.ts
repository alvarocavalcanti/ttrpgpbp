import { test, expect } from '@playwright/test'
import { dismissWhatsNew, seedAndSignIn } from './helpers'

// Public-route metadata is authored in React 19 (hoisted <title>/<meta>) and
// baked by the prerender; this runs against the dev server to prove the
// client-side wiring the prerender snapshots (issue #643, expanded in #644).

const PUBLIC_PAGES = [
  { path: '/', title: 'Role by Post — Play-by-Post RPG Chat' },
  { path: '/features', title: 'Features — Role by Post' },
  { path: '/play-by-post', title: 'Play-by-Post Tabletop RPGs — Role by Post' },
  { path: '/how-to/play-by-post-dnd', title: 'How to Play D&D by Post — Role by Post' },
  { path: '/how-to/run-play-by-post', title: 'How to Run a Play-by-Post Game — Role by Post' },
  { path: '/vs/discord', title: 'Role by Post vs Discord — Role by Post' },
  { path: '/alternatives/rpol', title: 'Role by Post vs RPOL — Role by Post' },
  { path: '/alternatives/myth-weavers', title: 'Role by Post vs Myth-Weavers — Role by Post' },
  { path: '/help', title: 'Help and Guides — Role by Post' },
  { path: '/help/dice-rolling', title: 'Dice Rolling — Role by Post Help' },
  { path: '/privacy', title: 'Privacy Policy — Role by Post' },
  { path: '/terms', title: 'Terms of Service — Role by Post' },
]

test.describe('public route metadata', () => {
  for (const { path, title } of PUBLIC_PAGES) {
    test(`${path} sets title, canonical, OG tags, and one h1`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveTitle(title)
      const canonical = path === '/' ? 'https://rolebypost.com/' : `https://rolebypost.com${path}`
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
      await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', '')
      await expect(page.locator('h1')).toHaveCount(1)
    })
  }

  test('signed-out / is the marketing landing and /login has the sign-in form', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Play your tabletop RPG, one post at a time' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible()
    await expect(page.getByText('Sign in with Google')).toHaveCount(0)

    await page.goto('/login')
    await expect(page.getByText('Email me a sign-in link')).toBeVisible()
  })

  test('help content is reachable while signed out', async ({ page }) => {
    await page.goto('/help/dice-rolling')
    await expect(page.getByRole('heading', { name: 'Dice Rolling', exact: true })).toBeVisible()
  })

  test('app routes are noindex', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('signed-in reload of / never paints the marketing landing (#658)', async ({ page }) => {
    await seedAndSignIn(page, `flicker-${Date.now()}@example.com`)
    await dismissWhatsNew(page)

    // Record any appearance of the landing heading across the reload, so a
    // transient flash fails the test instead of passing on the settled DOM.
    await page.addInitScript(() => {
      type WindowWithFlag = Window & { __sawLanding?: boolean }
      const w = window as WindowWithFlag
      w.__sawLanding = false
      const check = () => {
        const heading = document.querySelector('h1')
        if (heading?.textContent?.includes('Play your tabletop RPG')) w.__sawLanding = true
      }
      document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(check).observe(document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
        })
        check()
      })
    })

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Play your tabletop RPG, one post at a time' }),
    ).toHaveCount(0)
    expect(await page.evaluate(() => (window as Window & { __sawLanding?: boolean }).__sawLanding)).toBe(
      false,
    )
    // The lobby renders for the signed-in user.
    await expect(page.getByTestId('create-channel-fab')).toBeVisible()
  })
})
