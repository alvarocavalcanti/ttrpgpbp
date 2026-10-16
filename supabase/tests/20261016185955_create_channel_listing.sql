-- #722: creating a channel already listed (join_mode + listing copy) in one
-- transaction, with the same rules update_channel_settings enforces.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000072201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'create722@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000072202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'susp722@test.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000072202';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000072201', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000072201","role":"authenticated"}', true);

-- ==========================================
-- 1. A listed channel is created in one call
-- ==========================================

SELECT lives_ok(
  $$SELECT create_channel(
      'Listed Game', 'a7220001', 'GM', 'shadowdark', NULL, NULL, NULL, NULL,
      'approval', 'A weekly campaign.', 'Be kind.', 'Why do you want to join?')$$,
  'a GM can create a channel that is already listed'
);

SELECT is(
  (SELECT join_mode FROM channels WHERE invite_code = 'a7220001'),
  'approval'::public.channel_join_mode,
  'the listing lands in the same insert'
);
SELECT is(
  (SELECT description FROM channels WHERE invite_code = 'a7220001'),
  'A weekly campaign.',
  'the description is stored'
);
SELECT is(
  (SELECT constraints FROM channels WHERE invite_code = 'a7220001'),
  'Be kind.',
  'the constraints are stored'
);
SELECT is(
  (SELECT application_prompt FROM channels WHERE invite_code = 'a7220001'),
  'Why do you want to join?',
  'the application prompt is stored'
);

-- The channel, its GM membership and its listing share one transaction.
SELECT is(
  (SELECT COUNT(*) FROM channel_members cm
     JOIN channels c ON c.id = cm.channel_id
     WHERE c.invite_code = 'a7220001' AND cm.user_id = '00000000-0000-0000-0000-000000072201'),
  1::bigint,
  'the creating GM is a member of the new channel'
);

-- ==========================================
-- 2. The rules match channel settings
-- ==========================================

SELECT throws_ok(
  $$SELECT create_channel('No Copy', 'a7220002', 'GM', NULL, NULL, NULL, NULL, NULL, 'approval', NULL, NULL, NULL)$$,
  'P0001', 'A listed channel needs a description and constraints.',
  'a listed create without copy is refused'
);

SELECT throws_ok(
  $$SELECT create_channel('Long Copy', 'a7220003', 'GM', NULL, NULL, NULL, NULL, NULL, 'approval', repeat('d', 601), 'Be kind.', NULL)$$,
  'P0001', 'Description and constraints must be 600 characters or fewer.',
  'the description cap matches update_channel_settings'
);

SELECT throws_ok(
  $$SELECT create_channel('Long Prompt', 'a7220004', 'GM', NULL, NULL, NULL, NULL, NULL, 'approval', 'Weekly.', 'Be kind.', repeat('p', 301))$$,
  'P0001', 'The application prompt must be 300 characters or fewer.',
  'the prompt cap matches update_channel_settings'
);

SELECT throws_ok(
  $$SELECT create_channel('Bad Mode', 'a7220005', 'GM', NULL, NULL, NULL, NULL, NULL, 'public', 'Weekly.', 'Be kind.', NULL)$$,
  NULL, NULL,
  'an unknown join mode is refused'
);

-- A listed channel is apply-only, so a password would protect nothing: the
-- combination is refused rather than stored (review of #722).
SELECT throws_ok(
  $$SELECT create_channel('Locked Listed', 'a7220007', 'GM', NULL, NULL, NULL, 'hash', 'salt', 'approval', 'Weekly.', 'Be kind.', NULL)$$,
  'P0001', 'A listed channel cannot have a password. Players apply instead.',
  'a listed channel cannot be created with a password'
);

-- ==========================================
-- 3. Private stays private, and takes no copy
-- ==========================================

SELECT lives_ok(
  $$SELECT create_channel('Private Game', 'a7220006', 'GM', 'none')$$,
  'a channel created without a join mode is still created'
);
SELECT is(
  (SELECT join_mode FROM channels WHERE invite_code = 'a7220006'),
  'invite'::public.channel_join_mode,
  'it stays private'
);

SELECT is(
  (SELECT description IS NULL AND constraints IS NULL AND application_prompt IS NULL
     FROM channels WHERE invite_code = 'a7220006'),
  true,
  'no listing copy is stored on a private channel'
);

-- Copy sent for a private channel is dropped, prompt included: a private
-- channel has no application to prompt (review of #722).
SELECT lives_ok(
  $$SELECT create_channel('Private With Copy', 'a7220008', 'GM', 'none', NULL, NULL, NULL, NULL, 'invite', 'Stale description.', 'Stale constraints.', 'Stale prompt?')$$,
  'a private create tolerates stray listing copy'
);

SELECT is(
  (SELECT description IS NULL AND constraints IS NULL AND application_prompt IS NULL
     FROM channels WHERE invite_code = 'a7220008'),
  true,
  'stray copy is not stored on a private channel'
);

-- ==========================================
-- 4. A suspended caller creates nothing
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000072202', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000072202","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT create_channel('Suspended Listing', 'a7220009', 'GM', 'none', NULL, NULL, NULL, NULL, 'approval', 'Weekly.', 'Be kind.', NULL)$$,
  'P0001', 'Account suspended.',
  'a suspended caller cannot publish a listing'
);

SELECT * FROM finish();
ROLLBACK;
