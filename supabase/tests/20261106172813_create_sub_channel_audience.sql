-- #774: a room is created with its audience and its invitees in one call.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(21);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000077411', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomgm774@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000077412', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomp1774@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000077413', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomp2774@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000077414', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomout774@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000077415', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomblk774@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000077421', 'Rooms 774', '00000000-0000-0000-0000-000000077411', 'a7741001');

INSERT INTO channel_members (id, channel_id, user_id, character_name, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000077431', '00000000-0000-0000-0000-000000077421', '00000000-0000-0000-0000-000000077411', 'GM', false),
  ('00000000-0000-0000-0000-000000077432', '00000000-0000-0000-0000-000000077421', '00000000-0000-0000-0000-000000077412', 'P1', false),
  ('00000000-0000-0000-0000-000000077433', '00000000-0000-0000-0000-000000077421', '00000000-0000-0000-0000-000000077413', 'P2', false),
  ('00000000-0000-0000-0000-000000077435', '00000000-0000-0000-0000-000000077421', '00000000-0000-0000-0000-000000077415', 'Blocked', true);

-- The RPC's grants are checked BEFORE this test's blanket grant below, which
-- would otherwise make the assertion restate itself.
SELECT ok(
  NOT has_function_privilege('anon', 'public.create_sub_channel(uuid,text,boolean,boolean,boolean,boolean,text,uuid[])', 'EXECUTE'),
  'anon cannot create a room'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.create_sub_channel(uuid,text,boolean,boolean,boolean,boolean,text,uuid[])', 'EXECUTE'),
  'authenticated can create a room'
);
SELECT ok(
  has_function_privilege('service_role', 'public.create_sub_channel(uuid,text,boolean,boolean,boolean,boolean,text,uuid[])', 'EXECUTE'),
  'service_role can create a room'
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000077411', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000077411","role":"authenticated"}', true);

-- ==========================================
-- 1. Private room with invitees, one call
-- ==========================================

SELECT lives_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Secret', true, true, true, true, 'private',
      ARRAY['00000000-0000-0000-0000-000000077412', '00000000-0000-0000-0000-000000077413']::uuid[])$$,
  'the GM can create a private room with its invitees'
);
SELECT is(
  (SELECT visibility FROM sub_channels WHERE name = 'Secret'),
  'private',
  'the chosen audience is stored at creation'
);
SELECT is(
  (SELECT count(*) FROM sub_channel_members scm
     JOIN sub_channels sc ON sc.id = scm.sub_channel_id
     WHERE sc.name = 'Secret'),
  2::bigint,
  'both invitees land in the same transaction'
);

-- ==========================================
-- 2. Invites are ignored for a non-private audience
-- ==========================================

SELECT lives_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Open', true, true, true, true, 'all',
      ARRAY['00000000-0000-0000-0000-000000077412']::uuid[])$$,
  'a public room is created even when invitees were passed'
);
SELECT is(
  (SELECT count(*) FROM sub_channel_members scm
     JOIN sub_channels sc ON sc.id = scm.sub_channel_id
     WHERE sc.name = 'Open'),
  0::bigint,
  'a public room carries no invites'
);
SELECT is(
  (SELECT visibility FROM sub_channels WHERE name = 'Open'),
  'all',
  'the public room keeps the Everyone audience'
);

SELECT lives_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'GM Only', true, true, true, true, 'gm',
      ARRAY['00000000-0000-0000-0000-000000077412']::uuid[])$$,
  'a GM-only room is created even when invitees were passed'
);
SELECT is(
  (SELECT count(*) FROM sub_channel_members scm
     JOIN sub_channels sc ON sc.id = scm.sub_channel_id
     WHERE sc.name = 'GM Only'),
  0::bigint,
  'a GM-only room carries no invites'
);

-- ==========================================
-- 3. The old 2-argument call keeps today's defaults
-- ==========================================

SELECT lives_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-000000077421', 'Plain')$$,
  'a room created without an audience is still created'
);
SELECT is(
  (SELECT visibility FROM sub_channels WHERE name = 'Plain'),
  'all',
  'it is visible to everyone, as before'
);

-- ==========================================
-- 4. An invitee must be an unblocked member of the channel, and a refused
--    invitee leaves no room behind
-- ==========================================

SELECT throws_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Stranger', true, true, true, true, 'private',
      ARRAY['00000000-0000-0000-0000-000000077414']::uuid[])$$,
  'P0001', 'That player is not a member of this channel.',
  'a non-member cannot be invited'
);
SELECT is(
  (SELECT count(*) FROM sub_channels WHERE name = 'Stranger'),
  0::bigint,
  'the refused room is never created'
);

SELECT throws_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Blocked Room', true, true, true, true, 'private',
      ARRAY['00000000-0000-0000-0000-000000077415']::uuid[])$$,
  'P0001', 'That player is not a member of this channel.',
  'a blocked member cannot be invited'
);

SELECT throws_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Bad Audience', true, true, true, true, 'nonsense')$$,
  'P0001', 'Invalid audience.',
  'an unknown audience is refused'
);

-- ==========================================
-- 5. Duplicates, a null id and the GM's own id collapse to one invite
-- ==========================================

SELECT lives_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Deduped', true, true, true, true, 'private',
      ARRAY['00000000-0000-0000-0000-000000077412',
            '00000000-0000-0000-0000-000000077412',
            '00000000-0000-0000-0000-000000077411',
            NULL]::uuid[])$$,
  'a repeated or self invite does not refuse the room'
);
SELECT is(
  (SELECT count(*) FROM sub_channel_members scm
     JOIN sub_channels sc ON sc.id = scm.sub_channel_id
     WHERE sc.name = 'Deduped'),
  1::bigint,
  'the invitee list is deduplicated and never invites the GM'
);

-- ==========================================
-- 6. Only the GM creates
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000077412', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000077412","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000077421', 'Sneaky', true, true, true, true, 'private',
      ARRAY['00000000-0000-0000-0000-000000077412']::uuid[])$$,
  'P0001', 'Only the GM can create rooms.',
  'a player cannot create a private room'
);

-- ==========================================
-- 7. The dropped overload
-- ==========================================

SELECT is(
  to_regprocedure('public.create_sub_channel(uuid,text,boolean,boolean,boolean,boolean)'),
  NULL,
  'the 6-argument overload is gone, so PostgREST has one candidate'
);

SELECT * FROM finish();
ROLLBACK;
