import { test, expect, Page } from '@playwright/test';

async function signUp(page: Page, email: string): Promise<{ success: boolean; error?: string }> {
  return page.evaluate(async ({ email, password }) => {
    // @ts-expect-error - exposed in test/dev
    const client = window.__supabase;
    if (!client) throw new Error('Supabase client not found on window');
    const { error } = await client.auth.signUp({ email, password });
    return { success: !error, error: error?.message };
  }, { email, password });
}

async function createChannel(page: Page) {
  const createChannelFab = page.locator('[data-testid="create-channel-fab"]');
  await expect(createChannelFab).toBeVisible();
  await createChannelFab.click();
  await page.locator('#name').fill(`E2E Fail ${Date.now()}`);
  await page.locator('#characterName').fill('Fail GM');
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page).toHaveURL(/\/channel\/.+/);
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

  test('duplicate-email sign-up surfaces the error and does not redirect', async ({ page }) => {
    const email = `e2e.dup.${Date.now()}@gmail.com`;
    const first = await signUp(page, email);
    expect(first.success).toBe(true);
    await page.waitForURL('/');

    // Second sign-up with the same email must fail at the auth boundary and
    // never take the user anywhere else.
    const second = await signUp(page, email);
    expect(second.success).toBe(false);
    expect(second.error).toBeTruthy();
    expect(page.url()).toMatch(/\/login$/);
    // Lobby never renders for the failed attempt.
    await expect(page.locator('[data-testid="create-channel-fab"]')).not.toBeVisible();
  });

  test('create-channel inputs reject keystrokes past their limits', async ({ page }) => {
    await signUp(page, `e2e.limit.${Date.now()}@gmail.com`);
    await page.waitForURL('/');

    await page.locator('[data-testid="create-channel-fab"]').click();

    // Channel name cap = 80 characters; extra keystrokes are ignored.
    await page.locator('#name').pressSequentially('a'.repeat(120), { delay: 1 });
    expect(await page.locator('#name').inputValue()).toHaveLength(80);

    // Character name cap = 20 characters.
    await page.locator('#characterName').pressSequentially('b'.repeat(40), { delay: 1 });
    expect(await page.locator('#characterName').inputValue()).toHaveLength(20);
  });

  test('joining an unknown channel shows an error instead of crashing', async ({ page }) => {
    await signUp(page, `e2e.join.${Date.now()}@gmail.com`);
    await page.waitForURL('/');

    await page.goto(`/join/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText('Channel not found.')).toBeVisible();
  });

  test('message composer enforces the length cap and dice quantity clamps to 1', async ({ page }) => {
    await signUp(page, `e2e.chan.${Date.now()}@gmail.com`);
    await page.waitForURL('/');
    await createChannel(page);

    // Composer ships the length guard and refuses keystrokes past it.
    const composer = page.getByPlaceholder(/Type a message/);
    await expect(composer).toHaveAttribute('maxlength', '4000');
    await composer.fill('a'.repeat(3999));
    await composer.press('a');
    await composer.press('a');
    expect(await composer.inputValue()).toHaveLength(4000);

    // Dice quantity below 1 is clamped up to 1 (no zero-die or negative rolls).
    await page.getByRole('button', { name: /Roll Dice/i }).click();
    const quantity = page.locator('input[type="number"][min="1"]').first();
    await quantity.fill('0');
    expect(await quantity.inputValue()).toBe('1');
  });
});