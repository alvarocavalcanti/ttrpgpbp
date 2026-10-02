import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissWhatsNew, seedAndSignIn } from './helpers'

// Issue #642: the trailing header icon buttons carry `p-2` (8px) while the
// leading control has none, so the menu glyph sat 8px further in than the logo
// / back arrow. The fix cancels the button's own padding on the trailing edge
// (`-mr-2`). These tests measure the glyph insets from the viewport edges and
// assert they are symmetric; a regression reintroduces an 8px gap.

test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true })

async function measure(page: Page, leadingSelector: string, trailingButtonSelector: string) {
  return page.evaluate(
    ({ leadingSelector: leadingSel, trailingButtonSelector: buttonSel }) => {
      const leading = document.querySelector(leadingSel)
      const button = document.querySelector(buttonSel)
      const glyph = button?.querySelector('svg')
      if (!leading || !glyph) throw new Error('header glyphs not found')
      return {
        leadingInset: leading.getBoundingClientRect().left,
        trailingInset: window.innerWidth - glyph.getBoundingClientRect().right,
      }
    },
    { leadingSelector, trailingButtonSelector },
  )
}

test.describe('Header icon alignment (#642)', () => {
  test('lobby menu glyph lines up with the logo', async ({ page }) => {
    const email = `test.e2e.align.${Date.now()}.${test.info().workerIndex}.${Math.floor(Math.random() * 1e6)}@gmail.com`
    await page.goto('/login')
    await seedAndSignIn(page, email)
    await page.waitForURL('/')
    await dismissWhatsNew(page)
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()

    const { leadingInset, trailingInset } = await measure(
      page,
      'header a img',
      'header button[aria-label="Menu"]',
    )
    expect(Math.abs(leadingInset - trailingInset)).toBeLessThanOrEqual(1)
  })

  test('channel sidebar toggle lines up with the back arrow', async ({ page }) => {
    const email = `test.e2e.align.channel.${Date.now()}.${test.info().workerIndex}.${Math.floor(Math.random() * 1e6)}@gmail.com`
    await page.goto('/login')
    await seedAndSignIn(page, email)
    await page.waitForURL('/')
    await dismissWhatsNew(page)

    await page.locator('[data-testid="create-channel-fab"]').click()
    const name = `Align Campaign ${Date.now()}`
    await page.locator('#name').fill(name)
    await page.locator('#characterName').fill('E2E GM')
    await page.getByRole('button', { name: /^Create$/ }).click()
    await expect(page).toHaveURL(/\/channel\/.+/)
    await expect(page.getByRole('heading', { name })).toBeVisible()

    const { leadingInset, trailingInset } = await measure(
      page,
      'a[aria-label="Back to Lobby"] svg',
      'button[aria-label="Toggle sidebar menu"]',
    )
    // The main column's 1px right border makes the trailing inset exactly 1px
    // larger than the leading one; the pre-fix bug was 8px.
    expect(Math.abs(leadingInset - trailingInset)).toBeLessThanOrEqual(2)
  })
})
