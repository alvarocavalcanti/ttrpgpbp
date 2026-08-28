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
VALUES ('00000000-0000-0000-0000-000000000610', 'Export', '00000000-0000-0000-0000-000000000601', 'export307');

INSERT INTO channel_members (id, channel_id, user_id, character_name, character_notes, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000620', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'A', 'A private note', now()),
  ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'B', 'B private note', now());

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES
  ('00000000-0000-0000-0000-000000000630', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'regular', 'A msg 1'),
  ('00000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'regular', 'A msg 2'),
  ('00000000-0000-0000-0000-000000000632', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'regular', 'B msg 1'),
  ('00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'regular', 'B msg 2');

INSERT INTO dice_rolls (id, message_id, channel_id, roller_id, notation, result, breakdown)
VALUES
  ('00000000-0000-0000-0000-000000000640', '00000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'd20', 17, '{}'),
  ('00000000-0000-0000-0000-000000000641', '00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', 'd20', 3, '{}');

INSERT INTO message_reactions (id, message_id, channel_id, user_id, emoji)
VALUES
  ('00000000-0000-0000-0000-000000000650', '00000000-0000-0000-0000-000000000632', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', '👍'),
  ('00000000-0000-0000-0000-000000000651', '00000000-0000-0000-0000-000000000630', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000602', '🎲');

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

SELECT plan(12);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ==========================================
-- User A's export must include exactly A's own rows, nothing from B.
-- ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM profiles WHERE id = '00000000-0000-0000-0000-000000000601')::int, 1,
  'export: profile row reachable');

SELECT results_eq(
  $$SELECT character_name FROM channel_members WHERE user_id = '00000000-0000-0000-0000-000000000601'$$,
  $$VALUES ('A'::text)$$,
  'export: own membership scoped to self'
);

SELECT results_eq(
  $$SELECT content FROM messages WHERE sender_id = '00000000-0000-0000-0000-000000000601' ORDER BY id$$,
  $$VALUES ('A msg 1'::text), ('A msg 2'::text)$$,
  'export: own authored messages only'
);

SELECT is((SELECT count(*) FROM dice_rolls WHERE roller_id = '00000000-0000-0000-0000-000000000601')::int, 1,
  'export: own dice rolls only (B roll excluded)');

SELECT is((SELECT count(*) FROM message_reactions WHERE user_id = '00000000-0000-0000-0000-000000000601')::int, 1,
  'export: own reactions only (B reaction excluded)');

SELECT is((SELECT count(*) FROM notification_preferences WHERE user_id = '00000000-0000-0000-0000-000000000601')::int, 1,
  'export: own notification preferences reachable');

-- ==========================================
-- User B's export — same shape, proves scoping is per-user, not accidental.
-- ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM profiles WHERE id = '00000000-0000-0000-0000-000000000602')::int, 1,
  'export: profile row reachable for second user');

SELECT results_eq(
  $$SELECT character_name FROM channel_members WHERE user_id = '00000000-0000-0000-0000-000000000602'$$,
  $$VALUES ('B'::text)$$,
  'export: own membership scoped to self for second user'
);

SELECT results_eq(
  $$SELECT content FROM messages WHERE sender_id = '00000000-0000-0000-0000-000000000602' ORDER BY id$$,
  $$VALUES ('B msg 1'::text), ('B msg 2'::text)$$,
  'export: own authored messages only for second user'
);

SELECT is((SELECT count(*) FROM dice_rolls WHERE roller_id = '00000000-0000-0000-0000-000000000602')::int, 1,
  'export: own dice rolls only for second user');

SELECT is((SELECT count(*) FROM message_reactions WHERE user_id = '00000000-0000-0000-0000-000000000602')::int, 1,
  'export: own reactions only for second user');

SELECT is((SELECT count(*) FROM notification_preferences WHERE user_id = '00000000-0000-0000-0000-000000000602')::int, 1,
  'export: own notification preferences reachable for second user');

SELECT * FROM finish();
ROLLBACK;