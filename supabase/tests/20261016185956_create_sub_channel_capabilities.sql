-- #722: a room is created with its features already chosen.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000072211', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomgm722@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000072212', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomp1772@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000072221', 'Rooms', '00000000-0000-0000-0000-000000072211', 'a7221001');

INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000072221', '00000000-0000-0000-0000-000000072211', 'GM'),
  ('00000000-0000-0000-0000-000000072221', '00000000-0000-0000-0000-000000072212', 'P1');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000072211', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000072211","role":"authenticated"}', true);

-- ==========================================
-- 1. Chosen features are persisted at creation
-- ==========================================

SELECT lives_ok(
  $$SELECT create_sub_channel(
      '00000000-0000-0000-0000-000000072221', 'Dice Only', false, true, true, false)$$,
  'the GM can create a room with features already off'
);

SELECT is(
  (SELECT allow_dice FROM sub_channels WHERE name = 'Dice Only'),
  false,
  'the dice flag is stored at creation'
);
SELECT is(
  (SELECT allow_whispers FROM sub_channels WHERE name = 'Dice Only'),
  false,
  'the whispers flag is stored at creation'
);

-- ==========================================
-- 2. The two-argument call keeps today's defaults
-- ==========================================

SELECT lives_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-000000072221', 'Plain')$$,
  'a room created without features is still created'
);
SELECT is(
  (SELECT allow_dice AND allow_scenes AND allow_npc AND allow_whispers
     FROM sub_channels WHERE name = 'Plain'),
  true,
  'it allows everything, as before'
);

-- ==========================================
-- 3. The room rules are unchanged
-- ==========================================

SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-000000072221', 'Main')$$,
  'P0001', 'Main is a reserved room name.',
  'the reserved room name is still refused'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000072212', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000072212","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-000000072221', 'Sneaky', false, false, false, false)$$,
  'P0001', 'Only the GM can create rooms.',
  'a player cannot create a room'
);

SELECT * FROM finish();
ROLLBACK;
