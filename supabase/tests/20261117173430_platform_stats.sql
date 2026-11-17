-- #808: platform_stats + get_platform_stats().
--
-- Two things matter here, and neither is the happy path:
--   * the definitions (archived out, private in, system/null senders out,
--     soft-deleted in, the 14-day and 7-day boundaries), and
--   * the boundary of the anonymous surface (six scalars, table unreachable).
--
-- Assertions are deltas against a refreshed baseline, not absolute counts: the
-- local stack carries other data, so an absolute number would be a lie.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(15);

-- ==========================================
-- Baseline (the transaction's now() is constant, so the boundaries below are
-- exact rather than racing the clock)
-- ==========================================

SELECT public.refresh_platform_stats();
CREATE TEMP TABLE stats_baseline AS SELECT * FROM public.platform_stats;

-- ==========================================
-- Fixtures (owner: bypasses RLS and the lifecycle trigger)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000081a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm810@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000081a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p1-810@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000081a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2-810@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000081a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p3-810@test.com', '', now(), '{}', '{}', now(), now());

-- b01 listed + active · b02 private + active · b03 archived + active ·
-- b04 exactly on the 14-day boundary · b05 one message short ·
-- b06 one sender short · b07 system + null senders only · b08 mostly deleted ·
-- b09 busy but just outside the 14-day window · b10 created exactly 7 days ago ·
-- b11 created just over 7 days ago.
-- Listed channels need copy: channels_listing_fields.
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, is_archived, description, constraints, created_at)
VALUES
  ('00000000-0000-0000-0000-000000081b01', 'Listed Active', '00000000-0000-0000-0000-000000081a01', 'a0810001', 'approval', false, 'A weekly campaign.', 'Be kind.', now()),
  ('00000000-0000-0000-0000-000000081b02', 'Private Active', '00000000-0000-0000-0000-000000081a01', 'a0810002', 'invite', false, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000081b03', 'Archived Active', '00000000-0000-0000-0000-000000081a01', 'a0810003', 'approval', true, 'Gone soon.', 'Rules.', now()),
  ('00000000-0000-0000-0000-000000081b04', 'Boundary', '00000000-0000-0000-0000-000000081a01', 'a0810004', 'invite', false, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000081b05', 'One Short', '00000000-0000-0000-0000-000000081a01', 'a0810005', 'invite', false, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000081b06', 'One Sender', '00000000-0000-0000-0000-000000081a01', 'a0810006', 'invite', false, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000081b07', 'Not Human', '00000000-0000-0000-0000-000000081a01', 'a0810007', 'invite', false, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000081b08', 'Mostly Deleted', '00000000-0000-0000-0000-000000081a01', 'a0810008', 'invite', false, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000081b09', 'Stale But Busy', '00000000-0000-0000-0000-000000081a01', 'a0810009', 'invite', false, NULL, NULL, now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000081b10', 'Exactly Seven', '00000000-0000-0000-0000-000000081a01', 'a0810010', 'invite', false, NULL, NULL, now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000081b11', 'Just Over Seven', '00000000-0000-0000-0000-000000081a01', 'a0810011', 'invite', false, NULL, NULL, now() - interval '7 days 1 hour');

-- Three distinct new members; p1 is in two channels so a non-distinct count
-- would read four.
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000081b01', '00000000-0000-0000-0000-000000081a02', 'Member'),
  ('00000000-0000-0000-0000-000000081b01', '00000000-0000-0000-0000-000000081a03', 'Member'),
  ('00000000-0000-0000-0000-000000081b02', '00000000-0000-0000-0000-000000081a02', 'Member'),
  ('00000000-0000-0000-0000-000000081b02', '00000000-0000-0000-0000-000000081a04', 'Member');

-- 15 fresh human messages, two senders: b01, b02, b08.
INSERT INTO messages (channel_id, sender_id, type, content, created_at, is_deleted)
SELECT c.id,
       (ARRAY['00000000-0000-0000-0000-000000081a02',
              '00000000-0000-0000-0000-000000081a03'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '1 day',
       c.id = '00000000-0000-0000-0000-000000081b08' AND g > 1
FROM generate_series(1, 15) AS g
CROSS JOIN (VALUES ('00000000-0000-0000-0000-000000081b01'::uuid),
                   ('00000000-0000-0000-0000-000000081b02'::uuid),
                   ('00000000-0000-0000-0000-000000081b03'::uuid),
                   ('00000000-0000-0000-0000-000000081b08'::uuid)) AS c(id);

-- Exactly 14 days old still counts.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000081b04',
       (ARRAY['00000000-0000-0000-0000-000000081a02',
              '00000000-0000-0000-0000-000000081a03'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '14 days'
FROM generate_series(1, 15) AS g;

-- 14 messages is one short of the gate.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000081b05',
       (ARRAY['00000000-0000-0000-0000-000000081a02',
              '00000000-0000-0000-0000-000000081a03'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '1 day'
FROM generate_series(1, 14) AS g;

-- 15 messages from a single sender is one sender short.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000081b06',
       '00000000-0000-0000-0000-000000081a02',
       'regular', 'post ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

-- Qualifying on both gates, but one hour past the 14-day window: without the
-- window this channel would count as active, so this fixture is what fails if
-- the time filter is ever dropped.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000081b09',
       (ARRAY['00000000-0000-0000-0000-000000081a02',
              '00000000-0000-0000-0000-000000081a03'])[1 + (g % 2)]::uuid,
       'regular', 'post ' || g, now() - interval '14 days 1 hour'
FROM generate_series(1, 15) AS g;

-- System rows and null senders are never human activity.
INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000081b07',
       '00000000-0000-0000-0000-000000081a02',
       'system', 'joined ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

INSERT INTO messages (channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000081b07',
       NULL, 'regular', 'orphan ' || g, now() - interval '1 day'
FROM generate_series(1, 15) AS g;

-- ==========================================
-- 1. The definitions (deltas over the baseline)
-- ==========================================

SELECT public.refresh_platform_stats();

SELECT is(
  (SELECT games FROM public.platform_stats) - (SELECT games FROM stats_baseline),
  10::bigint,
  'Games counts every non-archived channel: listed, private, and the boundary fixtures'
);

SELECT is(
  (SELECT messages FROM public.platform_stats) - (SELECT messages FROM stats_baseline),
  119::bigint,
  'Messages sent counts human messages everywhere, soft-deleted and archived included, and drops system/null senders'
);

SELECT is(
  (SELECT members FROM public.platform_stats) - (SELECT members FROM stats_baseline),
  3::bigint,
  'Members counts distinct accounts in a game, not seats across games'
);

SELECT is(
  (SELECT active_games FROM public.platform_stats) - (SELECT active_games FROM stats_baseline),
  4::bigint,
  'Active games need 2+ senders and 15+ messages inside 14 days (archived, short, single-sender and stale games excluded)'
);

SELECT is(
  (SELECT recruiting_games FROM public.platform_stats) - (SELECT recruiting_games FROM stats_baseline),
  1::bigint,
  'Recruiting games are the non-archived listed slice only'
);

SELECT is(
  (SELECT new_games_week FROM public.platform_stats) - (SELECT new_games_week FROM stats_baseline),
  8::bigint,
  'New games this week counts non-archived channels created in the last 7 days'
);

SELECT is(
  (SELECT count(*) FROM public.platform_stats),
  1::bigint,
  'The refresh is an upsert: one row, however often it runs'
);

-- ==========================================
-- 2. The anonymous surface
-- ==========================================

SELECT is(
  pg_get_function_result('public.get_platform_stats()'::regprocedure),
  'TABLE(games bigint, messages bigint, members bigint, active_games bigint, recruiting_games bigint, new_games_week bigint)',
  'The public projection exposes six scalars and nothing else'
);

SELECT is(
  has_function_privilege('anon', 'public.get_platform_stats()', 'EXECUTE'),
  true,
  'anon may execute the platform stats projection'
);

SELECT is(
  has_function_privilege('authenticated', 'public.refresh_platform_stats()', 'EXECUTE'),
  false,
  'authenticated cannot force a refresh'
);

SELECT is(
  has_function_privilege('service_role', 'public.refresh_platform_stats()', 'EXECUTE'),
  false,
  'service_role cannot force a refresh either'
);

-- Both surfaces read one role-agnostic function: same answer, whoever asks.
CREATE TEMP TABLE stats_privileged AS
  SELECT games, messages, members, active_games, recruiting_games, new_games_week
  FROM public.get_platform_stats();

SET LOCAL ROLE anon;

-- Captured as anon (a temp table is readable by its creator), then compared
-- after the role is restored.
CREATE TEMP TABLE stats_anon AS
  SELECT games, messages, members, active_games, recruiting_games, new_games_week
  FROM public.get_platform_stats();

SELECT throws_ok(
  'SELECT count(*) FROM public.platform_stats',
  '42501',
  NULL,
  'anon cannot read the cache table directly — the projection is the only way in'
);

RESET ROLE;

SELECT is(
  (SELECT ROW(games, messages, members, active_games, recruiting_games, new_games_week)::text
     FROM stats_anon),
  (SELECT ROW(games, messages, members, active_games, recruiting_games, new_games_week)::text
     FROM stats_privileged),
  'An anonymous caller sees exactly what a privileged caller sees'
);

SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM public.platform_stats),
  0::bigint,
  'authenticated holds SELECT on the cache but RLS shows no rows'
);

RESET ROLE;

-- ==========================================
-- 3. The empty-platform contract
-- ==========================================

DELETE FROM public.platform_stats;

SELECT is(
  (SELECT ROW(games, messages, members, active_games, recruiting_games, new_games_week)::text
     FROM public.get_platform_stats()),
  '(0,0,0,0,0,0)'::text,
  'A missing cache row returns one row of zeros, never nulls and never no rows'
);

SELECT * FROM finish();
ROLLBACK;
