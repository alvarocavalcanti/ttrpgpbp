-- #808: admin_list_channels applies a 14-day window to its activity counts.
--
-- The Active Channels card is a liveness signal, so both gates (>= 2 distinct
-- human senders, >= 15 non-system human messages) must hold inside the last 14
-- days. This file pins the window, the inclusive boundary, the archived
-- exclusion, and the human-message definition.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(15);

-- ==========================================
-- Fixtures (owner: bypasses RLS and the lifecycle trigger)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000080a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin808@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000080a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm808@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000080a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p1-808@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000080a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2-808@test.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000080a01';

-- b01 baseline · b02 exactly on the 14-day boundary · b03 just outside it ·
-- b04 one fresh sender plus one stale one · b05 archived but busy ·
-- b06 system-only · b07 null senders · b08 mostly soft-deleted.
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, is_archived)
VALUES
  ('00000000-0000-0000-0000-000000080b01', 'Baseline Active', '00000000-0000-0000-0000-000000080a02', 'a0808001', 'invite', false),
  ('00000000-0000-0000-0000-000000080b02', 'Exactly Fourteen', '00000000-0000-0000-0000-000000080a02', 'a0808002', 'invite', false),
  ('00000000-0000-0000-0000-000000080b03', 'Just Outside', '00000000-0000-0000-0000-000000080a02', 'a0808003', 'invite', false),
  ('00000000-0000-0000-0000-000000080b04', 'One Fresh Sender', '00000000-0000-0000-0000-000000080a02', 'a0808004', 'invite', false),
  ('00000000-0000-0000-0000-000000080b05', 'Archived But Busy', '00000000-0000-0000-0000-000000080a02', 'a0808005', 'invite', true),
  ('00000000-0000-0000-0000-000000080b06', 'System Only', '00000000-0000-0000-0000-000000080a02', 'a0808006', 'invite', false),
  ('00000000-0000-0000-0000-000000080b07', 'Null Senders', '00000000-0000-0000-0000-000000080a02', 'a0808007', 'invite', false),
  ('00000000-0000-0000-0000-000000080b08', 'Mostly Deleted', '00000000-0000-0000-0000-000000080a02', 'a0808008', 'invite', false);

-- The two senders are members of every channel they post in, so no trigger or
-- policy has to guess at membership.
INSERT INTO channel_members (channel_id, user_id, character_name)
SELECT c.id, u.id, 'Member'
FROM channels c
CROSS JOIN (VALUES ('00000000-0000-0000-0000-000000080a03'::uuid),
                   ('00000000-0000-0000-0000-000000080a04'::uuid)) AS u(id);

-- Two senders, 15 messages, one day ago.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b01',
       (ARRAY['00000000-0000-0000-0000-000000080a03',
              '00000000-0000-0000-0000-000000080a04'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

-- Exactly 14 days old: the boundary is inclusive, so this still counts.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b02',
       (ARRAY['00000000-0000-0000-0000-000000080a03',
              '00000000-0000-0000-0000-000000080a04'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '14 days'
FROM generate_series(1, 15) AS g;

-- One hour past the window: the game has gone quiet.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b03',
       (ARRAY['00000000-0000-0000-0000-000000080a03',
              '00000000-0000-0000-0000-000000080a04'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '14 days 1 hour'
FROM generate_series(1, 15) AS g;

-- 15 fresh messages from one sender, 15 stale ones from another: only one
-- distinct sender is inside the window, so the game is not active.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b04',
       '00000000-0000-0000-0000-000000080a03',
       'regular', 'fresh ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b04',
       '00000000-0000-0000-0000-000000080a04',
       'regular', 'stale ' || g, now() - interval '30 days'
FROM generate_series(1, 15) AS g;

-- An archived game never appears in the console list, however busy it is.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b05',
       (ARRAY['00000000-0000-0000-0000-000000080a03',
              '00000000-0000-0000-0000-000000080a04'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

-- System rows are not human activity.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b06',
       '00000000-0000-0000-0000-000000080a03',
       'system', 'joined ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

-- A null sender is not a human sender.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000080b07',
       NULL, 'regular', 'orphan ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

-- Soft-deleted rows still count: they were activity when posted.
INSERT INTO messages (channel_id, sender_id, type, content, created_at, is_deleted)
SELECT '00000000-0000-0000-0000-000000080b08',
       (ARRAY['00000000-0000-0000-0000-000000080a03',
              '00000000-0000-0000-0000-000000080a04'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '1 day', g > 1
FROM generate_series(1, 15) AS g;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- ==========================================
-- 1. The window
-- ==========================================

SELECT is(
  (SELECT human_sender_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b01'),
  2::bigint,
  'A game with two recent senders counts both of them'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b01'),
  15::bigint,
  'A game with fifteen recent messages counts all of them'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b02'),
  15::bigint,
  'Activity exactly 14 days old is still inside the window'
);

SELECT is(
  (SELECT human_sender_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b03'),
  0::bigint,
  'Activity one hour past 14 days no longer counts senders'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b03'),
  0::bigint,
  'Activity one hour past 14 days no longer counts messages'
);

SELECT is(
  (SELECT human_sender_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b04'),
  1::bigint,
  'A sender who has been quiet for a month drops out of the sender count'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b04'),
  15::bigint,
  'Only the messages inside the window are counted'
);

-- ==========================================
-- 2. Scope and the human-message definition
-- ==========================================

SELECT is(
  (SELECT count(*) FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b05'),
  0::bigint,
  'An archived game never appears in the console list'
);

SELECT is(
  (SELECT human_sender_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b06'),
  0::bigint,
  'System messages do not make a sender human'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b06'),
  0::bigint,
  'System messages are not human messages'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b07'),
  0::bigint,
  'A null sender is not human activity'
);

SELECT is(
  (SELECT human_message_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b08'),
  15::bigint,
  'Soft-deleted messages still count as activity'
);

-- ==========================================
-- 3. The window is the only behaviour change
-- ==========================================

SELECT is(
  (SELECT member_count FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000080b01'),
  2::bigint,
  'Member count is still lifetime, not windowed'
);

SELECT is(
  (SELECT count(*) FROM admin_list_channels() WHERE id::text LIKE '00000000-0000-0000-0000-000000080b%'),
  7::bigint,
  'The projection still lists every non-archived channel'
);

-- Drop to a non-admin and confirm the guard still holds.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a03","role":"authenticated"}', true);

SELECT throws_ok(
  'SELECT * FROM admin_list_channels()',
  'P0001',
  'Not authorized',
  'A non-admin still cannot read the console projection'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
