-- #674 Discover search: the free-text query matches name + description +
-- game_system, while discovery stays scoped to listed channels and hides
-- blocked callers / private channels.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(11);

-- ==========================================
-- Fixtures (owner: bypasses RLS)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000067e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm676@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'search676@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067e03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blocked676@test.com', '', now(), '{}', '{}', now(), now());

-- No name or description below contains its own game system, so a system-only
-- match can only come from the new c.game_system predicate.
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints, game_system)
VALUES
  ('00000000-0000-0000-0000-000000067f01', 'Midweek Delves', '00000000-0000-0000-0000-000000067e01', 'e0676001', 'approval', 'Descend into the dark.', 'Be kind.', 'shadowdark'),
  ('00000000-0000-0000-0000-000000067f02', 'Generic Campaign', '00000000-0000-0000-0000-000000067e01', 'e0676002', 'approval', 'Weekly one-shots.', 'Be kind.', 'none'),
  ('00000000-0000-0000-0000-000000067f03', 'Secret Delves', '00000000-0000-0000-0000-000000067e01', 'e0676003', 'invite', NULL, NULL, 'shadowdark');

-- e03 is blocked from the listed Shadowdark channel.
INSERT INTO channel_members (channel_id, user_id, character_name, is_blocked)
VALUES ('00000000-0000-0000-0000-000000067f01', '00000000-0000-0000-0000-000000067e03', 'Blocked', true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ==========================================
-- 1. The query matches the game system
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067e02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067e02","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM list_public_channels('shadowdark')),
  1::bigint,
  'Searching a game system returns the listed channel for it'
);

SELECT is(
  (SELECT name FROM list_public_channels('shadowdark')),
  'Midweek Delves',
  'The system match returns the right channel'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels('SHADOWDARK')),
  1::bigint,
  'The system match is case-insensitive'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels('shadow')),
  1::bigint,
  'The system match is a substring match'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels('none')),
  1::bigint,
  'A listing with no game system still matches its stored value'
);

-- p_game_system stays on the signature as an exact filter facet of this search
-- API, even though the Lobby no longer passes it (the free-text search covers
-- the system now).
SELECT is(
  (SELECT count(*) FROM list_public_channels(NULL, 'shadowdark')),
  1::bigint,
  'The exact game-system filter facet still works'
);

-- ==========================================
-- 2. Name and description still match
-- ==========================================

SELECT is(
  (SELECT count(*) FROM list_public_channels('Delves')),
  1::bigint,
  'Searching the name returns the channel'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels('one-shots')),
  1::bigint,
  'Searching the description returns the channel'
);

SELECT is(
  (SELECT count(*) FROM list_public_channels('nothing-matches-this')),
  0::bigint,
  'A query that matches nothing returns no listings'
);

-- ==========================================
-- 3. Discovery stays scoped
-- ==========================================

SELECT is(
  (SELECT count(*) FROM list_public_channels('shadowdark')
    WHERE id = '00000000-0000-0000-0000-000000067f03'),
  0::bigint,
  'A private channel is never returned, even when its system matches'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067e03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067e03","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM list_public_channels('shadowdark')),
  0::bigint,
  'A blocked caller gets nothing back from a system search'
);

SELECT * FROM finish();
ROLLBACK;
