import { test, expect } from '@playwright/test'

// Public-route metadata is authored in React 19 (hoisted <title>/<meta>) and
// baked by the prerender; this runs against the dev server to prove the
// client-side wiring the prerender snapshots (issue #643).

const PUBLIC_PAGES = [
  { path: '/', title: 'Role by Post — Play-by-Post RPG Chat' },
  { path: '/features', title: 'Features — Role by Post' },
  { path: '/privacy', title: 'Privacy Policy — Role by Post' },
  { path: '/terms', title: 'Terms of Service — Role by Post' },
]

test.describe('public route metadata', () => {
  for (const { path, title } of PUBLIC_PAGES) {
    test(`${path} sets title, canonical, and OG tags`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveTitle(title)
      const canonical = path === '/' ? 'https://rolebypost.com/' : `https://rolebypost.com${path}`
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
      await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', '')
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

  test('app routes are noindex', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })
})
