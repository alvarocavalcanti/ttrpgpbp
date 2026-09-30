import { test, expect, Page } from '@playwright/test';
import { dismissWhatsNew, seedAndSignIn } from './helpers';

// Browser-level regression coverage for #620: unit tests assert the shell
// classes, but only a real engine proves the window cannot be dragged. Runs
// in a mobile viewport with touch so the header drag matches the report.
test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true });

test.describe('Channel viewport scroll lock (#620)', () => {
  test.beforeEach(async () => {
    // Skip if local Supabase is not running (e.g. macOS Docker Desktop issue)
    try {
      const res = await fetch('http://127.0.0.1:54321/auth/v1/health');
      if (!res.ok) {
        test.skip(true, 'Local Supabase is not running');
      }
    } catch {
      test.skip(true, 'Local Supabase is not running');
    }
  });

  async function openChannel(page: Page): Promise<{ url: string; name: string }> {
    // Unique per worker: the suite runs fully parallel against one database.
    const email = `test.e2e.viewport.${Date.now()}.${test.info().workerIndex}.${Math.floor(Math.random() * 1e6)}@gmail.com`;
    await page.goto('/login');
    await seedAndSignIn(page, email);
    await page.waitForURL('/');
    await dismissWhatsNew(page);

    await page.locator('[data-testid="create-channel-fab"]').click();
    const name = `Viewport Campaign ${Date.now()}`;
    await page.locator('#name').fill(name);
    await page.locator('#characterName').fill('E2E GM');
    await page.getByRole('button', { name: /^Create$/ }).click();
    await expect(page).toHaveURL(/\/channel\/.+/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    return { url: page.url(), name };
  }

  async function snapshot(page: Page) {
    return page.evaluate(() => {
      const shell = document.querySelector('main > div');
      const header = document.querySelector('main h2');
      const shellRect = shell?.getBoundingClientRect();
      return {
        shellCount: document.querySelectorAll('main > div').length,
        shellPosition: shell ? getComputedStyle(shell).position : null,
        shellTop: shellRect?.top,
        shellHeight: shellRect?.height,
        viewportH: window.innerHeight,
        docScrollH: document.scrollingElement!.scrollHeight,
        docClientH: document.scrollingElement!.clientHeight,
        docScrollTop: document.scrollingElement!.scrollTop,
        headerTop: header?.getBoundingClientRect().top,
      };
    });
  }

  // Touch drag starting on the header name: the gesture must not move the
  // window. Playwright's touchscreen only taps, so drive it via CDP.
  async function touchDragUpOnHeader(page: Page) {
    const box = await page.getByRole('heading').first().boundingBox();
    if (!box) throw new Error('Channel header heading has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (i * 20) }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  }

  test('loaded channel shell is viewport-anchored and ignores header drags, online and offline', async ({ page, context }) => {
    await openChannel(page);
    // Let history/realtime settle so the layout is at rest.
    await page.waitForTimeout(1500);

    const before = await snapshot(page);
    expect(before.shellCount).toBe(1);
    expect(before.shellPosition).toBe('fixed');
    expect(Math.abs(before.shellTop!)).toBeLessThan(1);
    expect(Math.abs(before.shellHeight! - before.viewportH)).toBeLessThan(2);
    // The document itself must have no scroll room.
    expect(before.docScrollH).toBeLessThanOrEqual(before.docClientH + 1);

    await touchDragUpOnHeader(page);
    await page.waitForTimeout(600);
    const afterDrag = await snapshot(page);
    expect(afterDrag.docScrollTop).toBe(0);
    expect(Math.abs(afterDrag.headerTop! - before.headerTop!)).toBeLessThan(2);

    // Offline: the connection banner must float in the host without pushing
    // the channel or opening document scroll room, and drags still do nothing.
    await context.setOffline(true);
    const banner = page.getByTestId('realtime-banner');
    await expect(banner).toBeVisible();
    await expect(banner.evaluate((el) => !!el.closest('[data-testid="app-banner-host"]'))).resolves.toBe(true);

    const offline = await snapshot(page);
    expect(offline.docScrollH).toBeLessThanOrEqual(offline.docClientH + 1);
    await touchDragUpOnHeader(page);
    await page.waitForTimeout(600);
    const offlineAfterDrag = await snapshot(page);
    expect(offlineAfterDrag.docScrollTop).toBe(0);
    expect(Math.abs(offlineAfterDrag.headerTop! - offline.headerTop!)).toBeLessThan(2);
  });

  test('loading skeleton shell is viewport-anchored', async ({ page }) => {
    const { url, name } = await openChannel(page);

    // Hold the skeleton by delaying the data responses on a fresh navigation.
    // A request cancelled by the navigation itself mid-delay has nothing to
    // continue — swallow only that race, nothing else.
    await page.route('**/rest/v1/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        await route.continue();
      } catch (err) {
        if (!String((err as Error)?.message ?? err).includes('already handled')) throw err;
      }
    });
    try {
      await page.goto(url);
      await expect(page.getByTestId('channel-name-skeleton')).toBeVisible();

      const snap = await snapshot(page);
      expect(snap.shellCount).toBe(1);
      expect(snap.shellPosition).toBe('fixed');
      expect(Math.abs(snap.shellTop!)).toBeLessThan(1);
      expect(Math.abs(snap.shellHeight! - snap.viewportH)).toBeLessThan(2);
      expect(snap.docScrollH).toBeLessThanOrEqual(snap.docClientH + 1);
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
    }

    // The delayed responses then land and the channel loads normally.
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });
});
