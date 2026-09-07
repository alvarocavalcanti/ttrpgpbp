import { test, expect } from '@playwright/test';
import { dismissWhatsNew, seedUser, signIn, serviceRole } from './helpers';

// Issue #437: unread counts must only include messages the viewer can
// actually see.
//
// 1. get_user_channels_unread (lobby pill, badge refresh) now excludes
//    whispers between other members — the messages RLS policy already hid
//    them, but the count used to be the only surface that did not match.
// 2. get_unread_totals (the push edge function's badge payload, service_role,
//    which bypasses RLS) must exclude them too — otherwise the launcher badge
//    sticks at a count that reading can never clear.
// 3. Reading a channel (mark_channel_read, server clock) clears the badge.
test.describe('Unread counts and whispers', () => {
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

  test('whispers between other members never count as unread and reading clears the badge', async ({ page }) => {
    const ts = Date.now();
    const gm = await seedUser(`e2e.unread.gm.${ts}@gmail.com`);
    const alice = await seedUser(`e2e.unread.alice.${ts}@gmail.com`);
    const viewer = await seedUser(`e2e.unread.viewer.${ts}@gmail.com`);
    expect(gm.ok).toBe(true);
    expect(alice.ok).toBe(true);
    expect(viewer.ok).toBe(true);
    const gmId = gm.id!;
    const aliceId = alice.id!;
    const viewerId = viewer.id!;

    // Channel with three members; viewer's read boundary is in the past so
    // both messages start out unread.
    const channelRes = await serviceRole('/rest/v1/channels', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: `E2E Unread ${ts}`, gm_id: gmId }),
    });
    const [channel] = await channelRes.json();
    const channelId = channel.id as string;

    for (const [userId, characterName] of [[gmId, 'GM'], [aliceId, 'Alice'], [viewerId, 'Viewer']] as const) {
      const res = await serviceRole('/rest/v1/channel_members', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          channel_id: channelId,
          user_id: userId,
          character_name: characterName,
          last_read_at: '2020-01-01T00:00:00Z',
        }),
      });
      expect(res.ok).toBe(true);
    }

    // One regular message (visible to everyone) and one whisper from Alice to
    // the GM (invisible to the viewer).
    const postMessage = (body: Record<string, string>) =>
      serviceRole('/rest/v1/messages', { method: 'POST', body: JSON.stringify(body) });
    expect((await postMessage({ channel_id: channelId, sender_id: aliceId, type: 'regular', content: 'hello table' })).ok).toBe(true);
    expect((await postMessage({ channel_id: channelId, sender_id: aliceId, type: 'regular', content: 'psst gm', whisper_to: gmId })).ok).toBe(true);

    // Sign in as the viewer (already seeded above) and land on the lobby.
    await page.goto('/login');
    await signIn(page, `e2e.unread.viewer.${ts}@gmail.com`);
    await page.waitForURL('/');
    await dismissWhatsNew(page);

    // Lobby pill counts the regular message only — the whisper never appears.
    await expect(page.getByText('1 new')).toBeVisible();
    await expect(page.getByText('2 new')).not.toBeVisible();

    // The per-user RPC agrees (1, not 2).
    const unreadBefore = await page.evaluate(async () => {
      // @ts-expect-error - exposed in dev for E2E
      const client = window.__supabase;
      const { data } = await client.rpc('get_user_channels_unread', { p_user_id: (await client.auth.getUser()).data.user.id });
      return data as { channel_id: string; unread_count: number }[];
    });
    expect(unreadBefore).toEqual([{ channel_id: channelId, unread_count: 1 }]);

    // The push edge-function badge payload (service_role, RLS bypassed) must
    // agree too — this was the surface that over-counted whispers.
    const totalsRes = await serviceRole('/rest/v1/rpc/get_unread_totals', {
      method: 'POST',
      body: JSON.stringify({ p_user_ids: [viewerId] }),
    });
    const totals = await totalsRes.json();
    expect(totals).toEqual([{ user_id: viewerId, unread_count: 1 }]);

    // Reading the channel clears the badge: mark read via the app's own
    // client (server clock), then reload so the lobby recomputes from the RPC.
    await page.evaluate(async ({ channelId: cid }) => {
      // @ts-expect-error - exposed in dev for E2E
      const client = window.__supabase;
      await client.rpc('mark_channel_read', { p_channel_id: cid });
    }, { channelId });
    await page.reload();
    await dismissWhatsNew(page);

    await expect(page.getByText('1 new')).not.toBeVisible();
    const unreadAfter = await page.evaluate(async () => {
      // @ts-expect-error - exposed in dev for E2E
      const client = window.__supabase;
      const { data } = await client.rpc('get_user_channels_unread', { p_user_id: (await client.auth.getUser()).data.user.id });
      return data as { channel_id: string; unread_count: number }[];
    }, {});
    expect(unreadAfter).toEqual([{ channel_id: channelId, unread_count: 0 }]);
  });
});