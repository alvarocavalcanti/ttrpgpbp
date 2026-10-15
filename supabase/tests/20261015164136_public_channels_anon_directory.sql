-- #674 Phase 1.5: the anonymous /directory projection.
--
-- The point of this file is the boundary, not the happy path: the public RPC is
-- the only thing anon may execute, it exposes GM-authored name + description
-- and nothing else, and delisting/archiving removes a channel from it.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

-- ==========================================
-- Fixtures (owner: bypasses RLS and the lifecycle trigger)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000068a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm677@test.com', '', now(), '{}', '{}', now(), now());

-- f02 is the older listing. f03 is private but carries copy, and f04 is a listed
-- channel that is also archived — both must stay invisible. Inserting the
-- archived one directly is the only way to build that state: archiving through
-- UPDATE would delist it first (enforce_channel_listing_lifecycle).
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints, last_message_at, is_archived)
VALUES
  ('00000000-0000-0000-0000-000000068b01', 'Weekly Delves', '00000000-0000-0000-0000-000000068a01', 'a0680001', 'approval', 'A weekly Shadowdark campaign.', 'Be kind.', now() - interval '1 hour', false),
  ('00000000-0000-0000-0000-000000068b02', 'Dungeon Crawl', '00000000-0000-0000-0000-000000068a01', 'a0680002', 'approval', 'Old-school dungeon delving.', 'Post most days.', now() - interval '2 days', false),
  ('00000000-0000-0000-0000-000000068b03', 'Private Game', '00000000-0000-0000-0000-000000068a01', 'a0680003', 'invite', 'Secret game.', NULL, now(), false),
  ('00000000-0000-0000-0000-000000068b04', 'Archived Listing', '00000000-0000-0000-0000-000000068a01', 'a0680004', 'approval', 'Gone soon.', 'Rules.', now() - interval '3 days', true);

-- ==========================================
-- 1. The projection and the grant
-- ==========================================

-- The whole privacy guarantee in one assertion: if a future edit widens the
-- return type (an id, a GM name, an activity count), this fails.
SELECT is(
  pg_get_function_result('public.list_public_channels_anon(integer,integer)'::regprocedure),
  'TABLE(name text, description text)',
  'The anon projection exposes only name and description'
);

SELECT is(
  has_function_privilege('anon', 'public.list_public_channels_anon(integer,integer)', 'EXECUTE'),
  true,
  'anon may execute the directory projection'
);

-- ==========================================
-- 2. As anon: what is visible
-- ==========================================

SET LOCAL ROLE anon;

-- Supabase's bootstrap grants table-level SELECT to anon; RLS is the guard, and
-- the channels policy needs is_channel_member, which anon cannot execute — the
-- read is refused outright rather than filtered to zero rows.
SELECT throws_ok(
  'SELECT count(*) FROM channels',
  '42501',
  NULL,
  'anon cannot read channel rows directly — the projection is the only way in'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels_anon()),
  2::bigint,
  'Anon sees only the two live listed channels'
);

SELECT is(
  (SELECT array_agg(name) FROM (SELECT name FROM list_public_channels_anon()) rows),
  ARRAY['Weekly Delves', 'Dungeon Crawl'],
  'Anon rows come back most-recently-active first'
);

SELECT is(
  (SELECT description FROM list_public_channels_anon() WHERE name = 'Weekly Delves'),
  'A weekly Shadowdark campaign.',
  'Anon receives the GM-authored description'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels_anon() WHERE name = 'Private Game'),
  0::bigint,
  'A private channel never appears, even when it carries copy'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels_anon() WHERE name = 'Archived Listing'),
  0::bigint,
  'An archived listing never appears'
);

SELECT is(
  (SELECT name FROM list_public_channels_anon(1, 1)),
  'Dungeon Crawl',
  'Anon pagination resumes at the requested offset'
);

-- ==========================================
-- 3. The projection is role-agnostic
-- ==========================================

RESET ROLE;

SELECT is(
  (SELECT array_agg(name) FROM (SELECT name FROM list_public_channels_anon()) rows),
  ARRAY['Weekly Delves', 'Dungeon Crawl'],
  'A privileged caller sees the same rows, so the public view cannot drift'
);

SELECT * FROM finish();
ROLLBACK;
