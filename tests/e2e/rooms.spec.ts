import { test, expect } from '@playwright/test';
import { dismissWhatsNew, seedAndSignIn } from './helpers';

// Rooms (sub-channels) #621: the GM creates a room, posts in it, and the room's
// messages stay out of the Main timeline. Single-actor (GM) — the second-member
// fan-out is covered by the unit tests for the realtime room filter.
test.describe('Rooms', () => {
  test.beforeEach(async () => {
    try {
      const res = await fetch('http://127.0.0.1:54321/auth/v1/health');
      if (!res.ok) test.skip(true, 'Local Supabase is not running');
    } catch {
      test.skip(true, 'Local Supabase is not running');
    }
  });

  test('GM creates a room and its messages stay isolated from Main', async ({ page }) => {
    const email = `test.e2e.rooms.${Date.now()}@gmail.com`;
    await seedAndSignIn(page, email);
    await page.waitForURL('/');
    await dismissWhatsNew(page);

    // Create a channel (public by default).
    await page.locator('[data-testid="create-channel-fab"]').click();
    const channelName = `Rooms E2E ${Date.now()}`;
    await page.locator('#name').fill(channelName);
    await page.locator('#characterName').fill('Rooms GM');
    await page.getByRole('button', { name: /^Create$/ }).click();
    await expect(page).toHaveURL(/\/channel\/.+/);
    await expect(page.getByRole('heading', { name: channelName })).toBeVisible();

    // GM Tools → Rooms → create "OOC". The sidebar is sticky on desktop.
    await page.getByTestId('sidebar-menu').getByRole('button', { name: 'Rooms', exact: true }).click();
    await page.getByLabel('New room').fill('OOC');
    await page.getByRole('button', { name: 'Create room' }).click();

    // Creating a room navigates into it; the tab bar shows Main + OOC.
    await expect(page).toHaveURL(/\/channel\/.+\/sub\/.+/);
    await expect(page.getByRole('tab', { name: 'OOC' })).toBeVisible();

    // Post inside the room.
    const composer = page.getByRole('combobox', { name: 'Message' });
    await expect(composer).toHaveAttribute('placeholder', 'Message #OOC');
    await composer.fill('OOC-only message');
    await composer.press('Enter');
    await expect(page.getByText('OOC-only message')).toBeVisible();

    // Main must not show the room's message.
    await page.getByRole('tab', { name: 'Main' }).click();
    await expect(page).toHaveURL(/\/channel\/[^/]+$/);
    await expect(page.getByText('OOC-only message')).toHaveCount(0);
    // A room switch remounts the channel subtree, so the caret must come back
    // without a click (issue: focus lost on every navigation).
    await expect(composer).toBeFocused();
    await expect(composer).toHaveAttribute('placeholder', /^Message #/);

    // Reopening the room shows it again.
    await page.getByRole('tab', { name: 'OOC' }).click();
    await expect(page.getByText('OOC-only message')).toBeVisible();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveAttribute('placeholder', 'Message #OOC');

    // Keyboard navigation keeps focus on the room tabs: arrow keys then Enter
    // must not hand the caret to the composer.
    await page.getByRole('tab', { name: 'OOC' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Main' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/channel\/[^/]+$/);
    await expect(composer).not.toBeFocused();
  });
});
