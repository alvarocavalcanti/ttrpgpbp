-- #755: the anonymous game-page projection.
--
-- Boundary test, like the /directory projection's file: the RPC is the only
-- anon-reachable path, it exposes the GM-authored listing copy and never the
-- signed-in detail (id, member count, activity, membership state), and
-- delisted/archived/unknown games return no row.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

-- ==========================================
-- Fixtures (owner: bypasses RLS and the lifecycle trigger)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000075a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm755@test.com', '', now(), '{}', '{}', now(), now());

-- The signup trigger creates the profile row; stamp the display name the
-- shareable page shows for the GM.
INSERT INTO profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-000000075a01', 'GM SevenFiveFive')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO channels (id, name, gm_id, invite_code, join_mode, game_system, description, constraints, application_prompt, is_archived)
VALUES
  ('00000000-0000-0000-0000-000000075b01', 'Shared Delves', '00000000-0000-0000-0000-000000075a01', 'a0750001', 'approval', 'shadowdark', 'A shared Shadowdark campaign.', 'Post most days.', 'Why join us?', false),
  ('00000000-0000-0000-0000-000000075b02', 'Private Game', '00000000-0000-0000-0000-000000075a01', 'a0750002', 'invite', 'shadowdark', 'Secret game.', 'Rules.', 'Why?', false),
  ('00000000-0000-0000-0000-000000075b03', 'Archived Listing', '00000000-0000-0000-0000-000000075a01', 'a0750003', 'approval', 'shadowdark', 'Gone.', 'Rules.', 'Why?', true);

-- ==========================================
-- 1. The projection and the grant
-- ==========================================

-- If a future edit adds an id, a member count, or an activity timestamp, this
-- fails. The anonymous page only ever needs the GM-authored copy.
SELECT is(
  pg_get_function_result('public.get_public_channel_anon(uuid)'::regprocedure),
  'TABLE(name text, game_system text, description text, constraints text, application_prompt text, gm_display_name text)',
  'The anon game projection exposes listing copy and nothing else'
);

SELECT is(
  has_function_privilege('anon', 'public.get_public_channel_anon(uuid)', 'EXECUTE'),
  true,
  'anon may execute the game-page projection'
);

-- ==========================================
-- 2. As anon: what is visible
-- ==========================================

SET LOCAL ROLE anon;

SELECT is(
  (SELECT name FROM get_public_channel_anon('00000000-0000-0000-0000-000000075b01')),
  'Shared Delves',
  'Anon receives the listed game'
);

SELECT is(
  (SELECT row(description, constraints, application_prompt, gm_display_name)::text
   FROM get_public_channel_anon('00000000-0000-0000-0000-000000075b01')),
  row('A shared Shadowdark campaign.', 'Post most days.', 'Why join us?', 'GM SevenFiveFive')::text,
  'Anon receives the full GM-authored copy and display name'
);

SELECT is(
  (SELECT count(*) FROM get_public_channel_anon('00000000-0000-0000-0000-000000075b02')),
  0::bigint,
  'A private channel never resolves, even with copy'
);

SELECT is(
  (SELECT count(*) FROM get_public_channel_anon('00000000-0000-0000-0000-000000075b03')),
  0::bigint,
  'An archived listing never resolves'
);

SELECT is(
  (SELECT count(*) FROM get_public_channel_anon('00000000-0000-0000-0000-000000075bff')),
  0::bigint,
  'An unknown id returns no row rather than an error'
);

-- ==========================================
-- 3. The projection is role-agnostic
-- ==========================================

RESET ROLE;

SELECT is(
  (SELECT name FROM get_public_channel_anon('00000000-0000-0000-0000-000000075b01')),
  'Shared Delves',
  'A privileged caller sees the same row, so the public view cannot drift'
);

SELECT * FROM finish();
ROLLBACK;
