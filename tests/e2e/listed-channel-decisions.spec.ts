import { test, expect } from '@playwright/test';
import { dismissWhatsNew, seedAndSignIn } from './helpers';

// #722: the two flows that used to require a trip through Channel Settings —
// creating a channel that is already listed, and learning the decision on an
// application inside the app (no push involved).
test.describe('Listed channel created up front, and the decision lands in the lobby', () => {
  test('the GM lists a channel at creation and the applicant sees the outcome', async ({ browser }) => {
    const stamp = Date.now();
    const channelName = `Listed E2E ${stamp}`;

    // ── GM: create the channel as Listed, in one pass ──────────────────────
    const gmContext = await browser.newContext();
    const gmPage = await gmContext.newPage();
    await seedAndSignIn(gmPage, `e2e-722-gm-${stamp}@example.com`);
    await dismissWhatsNew(gmPage);

    await gmPage.locator('[data-testid="create-channel-fab"]').click();
    await gmPage.getByLabel('Channel Name').fill(channelName);
    await gmPage.getByLabel('Your GM Name').fill('Listed GM');

    // The copy fields only exist once Listed is chosen.
    await expect(gmPage.getByLabel('Description')).toHaveCount(0);
    await gmPage.getByRole('button', { name: /Listed — apply to join/ }).click();
    await gmPage.getByLabel('Description').fill('A weekly campaign for E2E.');
    await gmPage.getByLabel('What you expect').fill('Post most weekdays.');
    await gmPage.getByRole('button', { name: /^Create$/ }).click();

    await gmPage.waitForURL(/\/channel\/.+/);
    const channelUrl = gmPage.url();

    // It is listed: the Lobby's Discover tab finds it without a settings trip.
    await gmPage.goto('/?tab=discover');
    await gmPage.getByLabel('Search games').fill(channelName);
    await expect(gmPage.getByTestId('discover-card').filter({ hasText: channelName })).toBeVisible();

    // ── Applicant: apply ──────────────────────────────────────────────────
    const applicantContext = await browser.newContext();
    const applicantPage = await applicantContext.newPage();
    await seedAndSignIn(applicantPage, `e2e-722-app-${stamp}@example.com`);
    await dismissWhatsNew(applicantPage);

    await applicantPage.goto('/?tab=discover');
    await applicantPage.getByLabel('Search games').fill(channelName);
    await applicantPage.getByTestId('discover-card').filter({ hasText: channelName }).click();
    await applicantPage.getByLabel('Character name').fill('Aria');
    await applicantPage.getByRole('button', { name: 'Apply to join' }).click();
    await expect(applicantPage.getByText('Your application is waiting')).toBeVisible();

    // ── GM: approve from the channel ──────────────────────────────────────
    await gmPage.goto(channelUrl);
    await gmPage.getByTestId('sidebar-menu').getByRole('button', { name: /^Settings/ }).click();
    await expect(gmPage.getByText('Join requests (1)')).toBeVisible();
    await gmPage.getByRole('button', { name: 'Approve' }).click();
    await expect(gmPage.getByText('Application approved')).toBeVisible();

    // ── Applicant: the decision is in the lobby, and dismissing sticks ─────
    await applicantPage.goto('/');
    await expect(applicantPage.getByTestId('join-request-notice')).toContainText(`You're in — ${channelName}`);

    await applicantPage.getByRole('button', { name: new RegExp(`Dismiss the good news about ${channelName}`) }).click();
    await expect(applicantPage.getByTestId('join-request-notice')).toHaveCount(0);

    // Acknowledged server-side: a reload must not bring it back.
    await applicantPage.reload();
    await expect(applicantPage.getByTestId('join-request-notice')).toHaveCount(0);

    await gmContext.close();
    await applicantContext.close();
  });

  // The rejection path is the one the issue described as "nothing changed".
  test('a declined application is announced and can be dismissed', async ({ browser }) => {
    const stamp = Date.now();
    const channelName = `Declined E2E ${stamp}`;
    const applicantEmail = `e2e-722-app2-${stamp}@example.com`;

    // Seed the GM and their listed channel through the app itself.
    const gmContext = await browser.newContext();
    const gmPage = await gmContext.newPage();
    await seedAndSignIn(gmPage, `e2e-722-gm2-${stamp}@example.com`);
    await dismissWhatsNew(gmPage);
    await gmPage.locator('[data-testid="create-channel-fab"]').click();
    await gmPage.getByLabel('Channel Name').fill(channelName);
    await gmPage.getByLabel('Your GM Name').fill('Declining GM');
    await gmPage.getByRole('button', { name: /Listed — apply to join/ }).click();
    await gmPage.getByLabel('Description').fill('Another weekly campaign.');
    await gmPage.getByLabel('What you expect').fill('Be kind.');
    await gmPage.getByRole('button', { name: /^Create$/ }).click();
    await gmPage.waitForURL(/\/channel\/.+/);
    const channelUrl = gmPage.url();

    const applicantContext = await browser.newContext();
    const applicantPage = await applicantContext.newPage();
    await seedAndSignIn(applicantPage, applicantEmail);
    await dismissWhatsNew(applicantPage);
    await applicantPage.goto('/?tab=discover');
    await applicantPage.getByLabel('Search games').fill(channelName);
    await applicantPage.getByTestId('discover-card').filter({ hasText: channelName }).click();
    await applicantPage.getByLabel('Character name').fill('Borin');
    await applicantPage.getByRole('button', { name: 'Apply to join' }).click();
    await expect(applicantPage.getByText('Your application is waiting')).toBeVisible();

    await gmPage.goto(channelUrl);
    await gmPage.getByTestId('sidebar-menu').getByRole('button', { name: /^Settings/ }).click();
    await expect(gmPage.getByText('Join requests (1)')).toBeVisible();
    await gmPage.getByRole('button', { name: 'Reject' }).click();
    await expect(gmPage.getByText('Application rejected')).toBeVisible();

    await applicantPage.goto('/');
    const notice = applicantPage.getByTestId('join-request-notice');
    await expect(notice).toContainText(`Your application to ${channelName} was declined`);
    // Declined means no way into the channel from the notice.
    await expect(notice.getByRole('link', { name: 'Open channel' })).toHaveCount(0);

    await applicantPage.getByRole('button', { name: new RegExp(`Dismiss the decision for ${channelName}`) }).click();
    await expect(notice).toHaveCount(0);

    await gmContext.close();
    await applicantContext.close();
  });
});
