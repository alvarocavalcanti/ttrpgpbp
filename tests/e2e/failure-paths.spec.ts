import { test, expect } from '@playwright/test';
import { dismissWhatsNew, seedUser, seedAndSignIn, signIn } from './helpers';

async function createChannel(page: import('@playwright/test').Page) {
  await dismissWhatsNew(page);
  const createChannelFab = page.locator('[data-testid="create-channel-fab"]');
  await expect(createChannelFab).toBeVisible();
  await createChannelFab.click();
  await page.locator('#name').fill(`E2E Fail ${Date.now()}`);
  await page.locator('#characterName').fill('Fail GM');
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page).toHaveURL(/\/channel\/.+/);
}

// The dice roller floats in the channel (bottom-left), so no composer options
// step is needed to reach it.
async function openDiceRoller(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open dice roller' }).click();
  const popover = page.getByRole('heading', { name: 'Dice Roller' });
  await expect(popover).toBeVisible();
}

test.describe('Failure paths', () => {
  test.beforeEach(async ({ page }) => {
    try {
      const res = await fetch('http://127.0.0.1:54321/auth/v1/health');
      if (!res.ok) {
        test.skip(true, 'Local Supabase is not running');
      }
    } catch {
      test.skip(true, 'Local Supabase is not running');
    }
    await page.goto('/login');
  });

  test('duplicate-email seeding is rejected at the auth boundary and the UI does not move', async ({ page }) => {
    const email = `e2e.dup.${Date.now()}@gmail.com`;
    const first = await seedUser(email);
    expect(first.ok).toBe(true);

    // The second registration with the same email is refused by the auth
    // boundary (Admin API reports the duplicate)...
    const second = await seedUser(email);
    expect(second.ok).toBe(false);
    expect(second.error).toBeTruthy();

    // ...and no session exists, so the UI stays on the login page.
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
    expect(page.url()).toMatch(/\/login$/);
    await expect(page.locator('[data-testid="create-channel-fab"]')).not.toBeVisible();

    // A wrong password against the seeded user fails the same way: no
    // redirect, no lobby UI.
    await signIn(page, email, 'WrongPassword123!').catch(() => {});
    expect(page.url()).toMatch(/\/login$/);
    await expect(page.locator('[data-testid="create-channel-fab"]')).not.toBeVisible();
  });

  test('create-channel inputs reject keystrokes past their limits', async ({ page }) => {
    await seedAndSignIn(page, `e2e.limit.${Date.now()}@gmail.com`);
    await page.waitForURL('/');
    await dismissWhatsNew(page);

    await page.locator('[data-testid="create-channel-fab"]').click();

    // Channel name cap = 80 characters; extra keystrokes are ignored.
    await page.locator('#name').pressSequentially('a'.repeat(120), { delay: 1 });
    expect(await page.locator('#name').inputValue()).toHaveLength(80);

    // Character name cap = 20 characters.
    await page.locator('#characterName').pressSequentially('b'.repeat(40), { delay: 1 });
    expect(await page.locator('#characterName').inputValue()).toHaveLength(20);
  });

  test('joining an unknown channel shows an error instead of crashing', async ({ page }) => {
    await seedAndSignIn(page, `e2e.join.${Date.now()}@gmail.com`);
    await page.waitForURL('/');

    await page.goto(`/join/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByRole('heading', { name: 'Channel Not Found' })).toBeVisible();
  });

  test('message composer enforces the length cap and the dice selection clears', async ({ page }) => {
    await seedAndSignIn(page, `e2e.chan.${Date.now()}@gmail.com`);
    await page.waitForURL('/');
    await createChannel(page);

    // Composer ships the length guard and refuses keystrokes past it.
    const composer = page.getByRole('combobox', { name: 'Message' });
    await expect(composer).toHaveAttribute('maxlength', '4000');
    await composer.fill('a'.repeat(3999));
    await composer.press('a');
    await composer.press('a');
    expect(await composer.inputValue()).toHaveLength(4000);

    // Clearing the dice selection cannot leave a zero-die roll: Roll is
    // disabled until a die is picked, and again once the bag is cleared.
    await openDiceRoller(page);
    const roll = page.getByRole('button', { name: 'Roll', exact: true });
    await expect(roll).toBeDisabled();
    await page.getByRole('button', { name: 'Add d6' }).click();
    await expect(roll).toBeEnabled();
    await page.getByRole('button', { name: 'Clear dice' }).click();
    await expect(roll).toBeDisabled();
  });

  test('composer accepts exactly the 4000-character cap', async ({ page }) => {
    await seedAndSignIn(page, `e2e.cap.${Date.now()}@gmail.com`);
    await page.waitForURL('/');
    await createChannel(page);

    const composer = page.getByRole('combobox', { name: 'Message' });
    const exactly4000 = 'a'.repeat(4000);
    await composer.fill(exactly4000);
    expect(await composer.inputValue()).toHaveLength(4000);
  });
})
