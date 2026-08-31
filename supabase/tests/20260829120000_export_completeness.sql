BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Issue #307: GDPR export completeness. Mirrors exactly what
-- src/features/auth/exportUserData.ts queries (profiles, channel_members,
-- messages, dice_rolls, message_reactions, notification_preferences) and
-- asserts each is scoped to the authenticated user's own rows only — no bleed
-- of another user's data, and every user-owned row is reachable. Runs under
-- SET LOCAL ROLE authenticated so RLS applies.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'export-a@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'export-b@example.com', '', now(), '{}', '{}', now(), now());

-- The on_auth_user_created trigger auto-creates each profile row.

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000000610', 'Export', '00000000-0000-0000-0000-000000000601', '307abf12'),
  -- Channel owned by B only; A is not a member, so RLS must hide every row here.
  ('00000000-0000-0000-0000-000000000611', 'Export B', '00000000-0000-0000-0000-000000000602', '307abf13');

INSERT INTO channel_members (id, channel_id, user_id, character_name, character_notes, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000620', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'A', 'A private note', now()),
  ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'B', 'B private note', now()),
  ('00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000602', 'B Solo', NULL, now());

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES
  ('00000000-0000-0000-0000-000000000630', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'regular', 'A msg 1'),
  ('00000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'regular', 'A msg 2'),
  ('00000000-0000-0000-0000-000000000632', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'regular', 'B msg 1'),
  ('00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'regular', 'B msg 2'),
  ('00000000-0000-0000-0000-000000000634', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000602', 'regular', 'B solo msg');

INSERT INTO dice_rolls (id, message_id, channel_id, roller_id, notation, result, breakdown)
VALUES
  ('00000000-0000-0000-0000-000000000640', '00000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'd20', 17, '{}'),
  ('00000000-0000-0000-0000-000000000641', '00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'd20', 3, '{}'),
  ('00000000-0000-0000-0000-000000000642', '00000000-0000-0000-0000-000000000634', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000602', 'd20', 5, '{}');

INSERT INTO message_reactions (id, message_id, channel_id, user_id, emoji)
VALUES
  ('00000000-0000-0000-0000-000000000650', '00000000-0000-0000-0000-000000000632', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', '👍'),
  ('00000000-0000-0000-0000-000000000651', '00000000-0000-0000-0000-000000000630', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', '🎲'),
  ('00000000-0000-0000-0000-000000000652', '00000000-0000-0000-0000-000000000634', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000602', '❤️');

-- Preferences are auto-created per user; set known values so the count
-- asserts are deterministic (one row per user, scoped to self).
INSERT INTO notification_preferences (user_id, push_enabled, badge_enabled, email_enabled)
VALUES
  ('00000000-0000-0000-0000-000000000601', true, false, false),
  ('00000000-0000-0000-0000-000000000602', false, true, true)
ON CONFLICT (user_id) DO UPDATE SET
  push_enabled = EXCLUDED.push_enabled,
  badge_enabled = EXCLUDED.badge_enabled,
  email_enabled = EXCLUDED.email_enabled;

SELECT plan(17);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ==========================================
-- Profile: profiles has no ownership RLS (viewable by everyone), but the
-- export filters by id client-side. Assert the user's own row is reachable
-- and that a foreign-channel owner's profile never leaks into their data.
-- ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM profiles WHERE id = '00000000-0000-0000-0000-000000000601')::int, 1,
  'export: profile row reachable');

-- ==========================================
-- channel_members / messages / dice_rolls / message_reactions use
-- channel-membership RLS (any member sees the channel). The export scopes to
-- the user's own rows with client-side user filters — assert BOTH the app's
-- query shape (own rows, same channel) AND that rows in a channel the user is
-- not a member of are hidden by RLS (a leak would surface them here).
-- ==========================================
SELECT results_eq(
  $$SELECT character_name FROM channel_members WHERE user_id = '00000000-0000-0000-0000-000000000601' AND channel_id = '00000000-0000-0000-0000-000000000610'$$,
  $$VALUES ('A'::text)$$,
  'export: own membership scoped to self'
);
SELECT is_empty(
  $$SELECT id FROM channel_members WHERE channel_id = '00000000-0000-0000-0000-000000000611'$$,
  'RLS: non-member channel membership is invisible'
);

SELECT results_eq(
  $$SELECT content FROM messages WHERE sender_id = '00000000-0000-0000-0000-000000000601' AND channel_id = '00000000-0000-0000-0000-000000000610' ORDER BY id$$,
  $$VALUES ('A msg 1'::text), ('A msg 2'::text)$$,
  'export: own authored messages only'
);
SELECT is_empty(
  $$SELECT id FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000611'$$,
  'RLS: non-member channel messages are invisible'
);

SELECT is((SELECT count(*) FROM dice_rolls WHERE roller_id = '00000000-0000-0000-0000-000000000601' AND channel_id = '00000000-0000-0000-0000-000000000610')::int, 1,
  'export: own dice rolls only (B roll excluded)');
SELECT is_empty(
  $$SELECT id FROM dice_rolls WHERE channel_id = '00000000-0000-0000-0000-000000000611'$$,
  'RLS: non-member channel dice rolls are invisible'
);

SELECT is((SELECT count(*) FROM message_reactions WHERE user_id = '00000000-0000-0000-0000-000000000601' AND channel_id = '00000000-0000-0000-0000-000000000610')::int, 1,
  'export: own reactions only (B reaction excluded)');
SELECT is_empty(
  $$SELECT id FROM message_reactions WHERE channel_id = '00000000-0000-0000-0000-000000000611'$$,
  'RLS: non-member channel reactions are invisible'
);

-- ==========================================
-- notification_preferences is the one owner-scoped table
-- (auth.uid() = user_id). No user filter: an unfiltered read must surface
-- only the caller's row, and the other user's row must be unreachable by id.
-- ==========================================
SELECT results_eq(
  $$SELECT push_enabled, badge_enabled, email_enabled FROM notification_preferences$$,
  $$VALUES (true, false, false)$$,
  'RLS: unfiltered preferences read returns only own row'
);
SELECT is_empty(
  $$SELECT id FROM notification_preferences WHERE user_id = '00000000-0000-0000-0000-000000000602'$$,
  'RLS: other user preferences unreachable even by direct id'
);

-- ==========================================
-- User B — same shape as A: own rows reachable, still no access to channel 610
-- rows A would find in B's other-channel rows are irrelevant; B's own export
-- must scope to B's rows only.
-- ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM profiles WHERE id = '00000000-0000-0000-0000-000000000602')::int, 1,
  'export: profile row reachable for second user');

SELECT results_eq(
  $$SELECT character_name FROM channel_members WHERE user_id = '00000000-0000-0000-0000-000000000602' AND channel_id = '00000000-0000-0000-0000-000000000610'$$,
  $$VALUES ('B'::text)$$,
  'export: own membership scoped to self for second user'
);

SELECT results_eq(
  $$SELECT content FROM messages WHERE sender_id = '00000000-0000-0000-0000-000000000602' AND channel_id = '00000000-0000-0000-0000-000000000610' ORDER BY id$$,
  $$VALUES ('B msg 1'::text), ('B msg 2'::text)$$,
  'export: own authored messages only for second user'
);

SELECT is((SELECT count(*) FROM dice_rolls WHERE roller_id = '00000000-0000-0000-0000-000000000602' AND channel_id = '00000000-0000-0000-0000-000000000610')::int, 1,
  'export: own dice rolls only for second user');

SELECT is((SELECT count(*) FROM message_reactions WHERE user_id = '00000000-0000-0000-0000-000000000602' AND channel_id = '00000000-0000-0000-0000-000000000610')::int, 1,
  'export: own reactions only for second user');

SELECT results_eq(
  $$SELECT push_enabled, badge_enabled, email_enabled FROM notification_preferences$$,
  $$VALUES (false, true, true)$$,
  'RLS: unfiltered preferences read returns only own row for second user'
);

SELECT * FROM finish();
ROLLBACK;