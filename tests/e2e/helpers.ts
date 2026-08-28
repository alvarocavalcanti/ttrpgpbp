import { Page } from '@playwright/test';

// A fresh session has never seen the changelog, so the What's New dialog
// overlays the lobby and intercepts clicks. Wait for it briefly, then dismiss
// it when present. Bounded so a session that has already seen it (or one where
// the dialog is slow to render) does not stall or fail.
export async function dismissWhatsNew(page: Page) {
  const dialog = page.getByRole('dialog', { name: "What's new" });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
  } catch {
    // Dialog never appeared for this session — nothing to dismiss.
  }
}