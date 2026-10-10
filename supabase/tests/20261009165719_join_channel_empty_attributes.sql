-- Regression: join_channel must persist an empty attributes object, not NULL.
--
-- jsonb_object_agg() over zero rows returns NULL, which previously overwrote
-- the '{}' default and violated channel_members.attributes NOT NULL. Covers
-- the invite-code happy path, NULL/empty/filtered attribute objects, clamping
-- parity, and the invalid-code branch.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test687gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test687a@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test687b@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test687c@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test687d@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test687e@example.com', '', now(), '{}', '{}', now(), now());

-- Channel A: invite-only, no password row (the reported repro shape).
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000500', 'Invite Only', '00000000-0000-0000-0000-000000000501', 'abcd1234');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Invite-code join with an explicit empty object succeeds =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000502');
SELECT is(
  (join_channel('00000000-0000-0000-0000-000000000500', 'Bard', NULL, NULL, NULL, 'abcd1234', '{}'::jsonb)->>'success'),
  'true',
  'invite-code join with empty attributes succeeds'
);
SELECT is(
  (SELECT attributes FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-000000000500'
     AND user_id = '00000000-0000-0000-0000-000000000502'),
  '{}'::jsonb,
  'empty attributes are stored as {} not NULL'
);

-- ===== 2. NULL attributes (argument omitted) also store {} =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000503');
SELECT is(
  (join_channel('00000000-0000-0000-0000-000000000500', 'Ranger', NULL, NULL, NULL, 'abcd1234')->>'success'),
  'true',
  'join with NULL attributes succeeds'
);
SELECT is(
  (SELECT attributes FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-000000000500'
     AND user_id = '00000000-0000-0000-0000-000000000503'),
  '{}'::jsonb,
  'NULL attributes are stored as {} not NULL'
);

-- ===== 3. Non-numeric-only object collapses to {} not NULL =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000504');
SELECT join_channel('00000000-0000-0000-0000-000000000500', 'Rogue', NULL, NULL, NULL, 'abcd1234',
  '{"junk": "x", "other": "y"}'::jsonb);
SELECT is(
  (SELECT attributes FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-000000000500'
     AND user_id = '00000000-0000-0000-0000-000000000504'),
  '{}'::jsonb,
  'non-numeric-only attributes collapse to {} (no NOT NULL violation)'
);

-- ===== 4. Numeric attributes still clamp (parity) =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000505');
SELECT join_channel('00000000-0000-0000-0000-000000000500', 'Fighter', NULL, NULL, NULL, 'abcd1234',
  '{"STR": 9, "WIS": -9}'::jsonb);
SELECT is(
  (SELECT attributes FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-000000000500'
     AND user_id = '00000000-0000-0000-0000-000000000505'),
  '{"STR": 5, "WIS": -4}'::jsonb,
  'numeric attributes still clamp to -4..5'
);

-- ===== 5. Wrong invite code without a password row is rejected =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000506');
SELECT is(
  join_channel('00000000-0000-0000-0000-000000000500', 'Rogue', NULL, NULL, NULL, 'wrongcode'),
  '{"success": false, "error": "Invalid password or invite code"}'::jsonb,
  'wrong invite code is rejected'
);

SELECT * FROM finish();
ROLLBACK;
