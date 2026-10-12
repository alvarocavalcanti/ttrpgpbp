import { test, expect, Page } from '@playwright/test'

// Browser-level regression coverage for #706: unit tests assert the shell and
// pane classes, but only a real engine proves the document cannot be dragged
// while the article scrolls and the sidebar/header stay put. `/help` is a
// public, prerendered route, so this needs no sign-in or seeded data.
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement!
    const rectTop = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().top ?? null
    // The scroll container is HelpPage's article pane, NOT AppShell's outer
    // <main> (the first `main` in the DOM, which never scrolls).
    const article = document.querySelector('[data-testid="help-article"]')
    return {
      docScrollH: doc.scrollHeight,
      docClientH: doc.clientHeight,
      docScrollTop: doc.scrollTop,
      headerTop: rectTop('header'),
      sidebarTop: rectTop('nav[class*="lg:w-64"]'),
      articleClientH: article instanceof HTMLElement ? article.clientHeight : null,
      articleScrollTop: article instanceof HTMLElement ? article.scrollTop : null,
    }
  })
}

async function scrollArticle(page: Page, top: number) {
  await page.evaluate((y) => {
    const article = document.querySelector('[data-testid="help-article"]')
    if (article instanceof HTMLElement) article.scrollTop = y
  }, top)
  await page.waitForTimeout(200)
}

test.describe('help page scroll lock (#706) — mobile', () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test('document cannot scroll; the article scrolls while the header and sidebar stay put', async ({ page }) => {
    await page.goto('/help/dice-rolling')
    await expect(page.getByRole('heading', { name: 'Dice Rolling', exact: true })).toBeVisible()
    await page.waitForTimeout(500)

    const before = await snapshot(page)
    // The shell is pinned to the viewport: the document has no scroll room.
    expect(before.docScrollH).toBeLessThanOrEqual(before.docClientH + 1)

    // Scroll the article pane itself.
    await scrollArticle(page, 400)

    const after = await snapshot(page)
    expect(after.docScrollTop).toBe(0)
    // The article itself moved — otherwise "nothing moved" would pass vacuously.
    expect(after.articleScrollTop).toBeGreaterThan(0)
    // Only the article moved — the marketing header and the topic sidebar did not.
    expect(Math.abs(after.headerTop! - before.headerTop!)).toBeLessThan(2)
    expect(Math.abs(after.sidebarTop! - before.sidebarTop!)).toBeLessThan(2)
  })

  test('footer disclosure overlays without reflowing the article', async ({ page }) => {
    await page.goto('/help/dice-rolling')
    await expect(page.getByRole('heading', { name: 'Dice Rolling', exact: true })).toBeVisible()
    await page.waitForTimeout(500)

    const disclosure = page.getByTestId('footer-disclosure')
    const heightBefore = (await snapshot(page)).articleClientH

    await disclosure.getByText('Site links').click()

    // The links open in a panel above the pinned bar, visible on top of the page.
    await expect(disclosure.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
    // Overlay, not push: the article pane keeps its height.
    expect((await snapshot(page)).articleClientH).toBe(heightBefore)
  })
})

test.describe('help page scroll lock (#706) — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('document cannot scroll and the sidebar is pinned', async ({ page }) => {
    await page.goto('/help/dice-rolling')
    await expect(page.getByRole('heading', { name: 'Dice Rolling', exact: true })).toBeVisible()
    await page.waitForTimeout(500)

    const before = await snapshot(page)
    expect(before.docScrollH).toBeLessThanOrEqual(before.docClientH + 1)

    await scrollArticle(page, 400)

    const after = await snapshot(page)
    expect(after.docScrollTop).toBe(0)
    expect(after.articleScrollTop).toBeGreaterThan(0)
    expect(Math.abs(after.sidebarTop! - before.sidebarTop!)).toBeLessThan(2)
  })
})
