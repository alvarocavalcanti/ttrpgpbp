import { test, expect } from '@playwright/test';
import { dismissWhatsNew } from './helpers';

test.describe('Core Journey', () => {
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

  test('sign-in, create channel, send message, and roll dice', async ({ page }) => {
    // Generate unique email to avoid collisions but keep it standard-looking
    const email = `test.e2e.${Date.now()}@gmail.com`;
    const password = 'Password123!';

    // 1. Go to login page
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();

    // 2. Programmatically sign up via window.__supabase
    const signUpResult = await page.evaluate(async ({ email, password }) => {
      // @ts-expect-error - exposed in test/dev
      const client = window.__supabase;
      if (!client) throw new Error('Supabase client not found on window');
      
      const { error } = await client.auth.signUp({
        email,
        password,
      });
      return { success: !error, error: error?.message };
    }, { email, password });

    expect(signUpResult.success).toBe(true);

    // 3. Wait for redirect to Lobby (/)
    await page.waitForURL('/');

    // A fresh session has never seen the changelog; dismiss the "What's New"
    // dialog so it does not overlay the lobby and block the create button.
    await dismissWhatsNew(page);

    const createChannelFab = page.locator('[data-testid="create-channel-fab"]');
    await expect(createChannelFab).toBeVisible();

    // 4. Create channel
    await createChannelFab.click();

    const channelName = `E2E Campaign ${Date.now()}`;
    await page.locator('#name').fill(channelName);
    await page.locator('#characterName').fill('E2E GM');
    await page.getByRole('button', { name: /^Create$/ }).click();

    // 5. Verify redirect to the channel page
    await expect(page).toHaveURL(/\/channel\/.+/);
    await expect(page.getByRole('heading', { name: channelName })).toBeVisible();

    // 6. Send a message
    const messageInput = page.getByPlaceholder(/Type a message.../);
    await expect(messageInput).toBeVisible();
    await messageInput.fill('Hello from E2E test!');
    await messageInput.press('Enter');

    // Verify message appears in feed
    await expect(page.getByText('Hello from E2E test!')).toBeVisible();

    // 7. Roll dice — open the options panel only if the dice control is hidden.
    const rollDiceBtn = page.getByRole('button', { name: /Roll Dice/i });
    if (!(await rollDiceBtn.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Toggle options' }).click();
    }
    await expect(rollDiceBtn).toBeVisible();
    await rollDiceBtn.click();

    // In the DiceRoller popover, click "Roll" to submit the default 1d20 roll
    const submitRollBtn = page.getByRole('button', { name: /^Roll$/ });
    await expect(submitRollBtn).toBeVisible();
    await submitRollBtn.click();

    // Assert that the dice roll message appears in the feed
    await expect(page.getByText(/rolled dice/i).first()).toBeVisible();
  });
});
