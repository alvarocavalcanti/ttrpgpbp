-- #621 Phase 2: per-room capability flags (dice / scenes / NPC / whispers),
-- enforced on every messages INSERT by the enforce_room_capabilities trigger.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(13);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'capgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'capp1@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000cb01', 'Cap', '00000000-0000-0000-0000-00000000ca01', 'cab00001');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-00000000cd01', '00000000-0000-0000-0000-00000000cb01', '00000000-0000-0000-0000-00000000ca01', 'GM'),
  ('00000000-0000-0000-0000-00000000cd02', '00000000-0000-0000-0000-00000000cb01', '00000000-0000-0000-0000-00000000ca02', 'P1');

-- r_all keeps the defaults (everything allowed); r_off is toggled below.
INSERT INTO sub_channels (id, channel_id, name, created_by)
VALUES
  ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-00000000cb01', 'All', '00000000-0000-0000-0000-00000000ca01'),
  ('00000000-0000-0000-0000-00000000cc02', '00000000-0000-0000-0000-00000000cb01', 'Quiet', '00000000-0000-0000-0000-00000000ca01');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ca01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ca01","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-00000000cc02', NULL, NULL, false, NULL, NULL, NULL)$$,
  'GM can turn dice off'
);
SELECT is(
  (SELECT allow_dice FROM sub_channels WHERE id = '00000000-0000-0000-0000-00000000cc02'),
  false,
  'The dice flag is persisted'
);
SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-00000000cb01', '1d20', NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000cc02')$$,
  'P0001', NULL,
  'A roll is rejected when dice are off in the room'
);
SELECT lives_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-00000000cb01', '1d20', NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000cc01')$$,
  'A roll is allowed when dice are on'
);

SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-00000000cc02', NULL, NULL, NULL, false, NULL, NULL)$$,
  'GM can turn scenes off'
);
SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000cb01', 'scene text', 'scene', NULL, NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000cc02')$$,
  'P0001', NULL,
  'A scene is rejected when scenes are off in the room'
);

SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-00000000cc02', NULL, NULL, NULL, NULL, false, NULL)$$,
  'GM can turn character posts off'
);
SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000cb01', 'npc text', 'npc', NULL, NULL, NULL, 'Bob', 'https://example.com/bob.png', NULL, '00000000-0000-0000-0000-00000000cc02')$$,
  'P0001', NULL,
  'An NPC post is rejected when character posts are off in the room'
);

SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-00000000cc02', NULL, NULL, NULL, NULL, NULL, false)$$,
  'GM can turn whispers off'
);

-- p1 whispers to the GM in the restricted room.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ca02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ca02","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000cb01', 'psst', 'regular', NULL, '00000000-0000-0000-0000-00000000ca01', NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000cc02')$$,
  'P0001', NULL,
  'A whisper is rejected when whispers are off in the room'
);
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000cb01', 'plain', 'regular', NULL, NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000cc02')$$,
  'A plain message is always allowed in the room'
);
SELECT throws_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-00000000cc02', NULL, NULL, true, NULL, NULL, NULL)$$,
  'P0001', NULL,
  'A non-GM cannot change a room setting'
);

-- Main (NULL room) is never restricted.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ca01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ca01","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000cb01', 'main scene', 'scene')$$,
  'Main still allows scenes'
);

SELECT * FROM finish();
ROLLBACK;
