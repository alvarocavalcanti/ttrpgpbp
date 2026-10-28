-- #621 rooms (sub-channels): schema, GM-only CRUD, message scoping, per-room
-- unread, the messages INSERT backstop, and routing immutability.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(27);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomp1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roomout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-00000000f001', 'Rooms One', '00000000-0000-0000-0000-00000000e001', 'aabbcc01'),
  ('00000000-0000-0000-0000-00000000f002', 'Rooms Two', '00000000-0000-0000-0000-00000000e001', 'aabbcc02'),
  ('00000000-0000-0000-0000-00000000f003', 'Rooms Cap', '00000000-0000-0000-0000-00000000e001', 'aabbcc03');

-- joined_at predates the fixture messages: a room with no read row falls back
-- to joined_at (20261028125531), so a member who was already in the channel
-- must still see the room's messages as unread.
INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at, joined_at)
VALUES
  ('00000000-0000-0000-0000-000000200001', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'GM', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000200002', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'P1', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000200003', '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e001', 'GMCap', now() - interval '1 hour', now() - interval '2 hours');

-- A fixed room per channel for the routing/scoping assertions, plus one room
-- with a Main message and a room message so unread has something to count.
INSERT INTO sub_channels (id, channel_id, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000300001', '00000000-0000-0000-0000-00000000f001', 'OOC', '00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-000000300002', '00000000-0000-0000-0000-00000000f002', 'Foreign', '00000000-0000-0000-0000-00000000e001');

-- Ten active rooms fill the cap for c3.
INSERT INTO sub_channels (channel_id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000f003', 'R' || g, '00000000-0000-0000-0000-00000000e001'
FROM generate_series(1, 10) g;

INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id)
VALUES
  ('00000000-0000-0000-0000-000000400001', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'regular', 'main-hello', NULL),
  ('00000000-0000-0000-0000-000000400002', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'regular', 'room-hello', '00000000-0000-0000-0000-000000300001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ---- GM-only CRUD ----------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
SELECT ok(
  create_sub_channel('00000000-0000-0000-0000-00000000f001', 'Dice') IS NOT NULL,
  'GM can create a room'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-00000000f001', 'Named')$$,
  'P0001', NULL,
  'A non-GM cannot create a room'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-00000000f001', 'ooc')$$,
  '23505', NULL,
  'A duplicate room name is rejected (case-insensitive)'
);

SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-00000000f003', 'OneTooMany')$$,
  'P0001', NULL,
  'The room cap is enforced'
);
SELECT lives_ok(
  $$SELECT update_sub_channel((SELECT id FROM sub_channels WHERE channel_id = '00000000-0000-0000-0000-00000000f003' AND name = 'R1'), NULL, true)$$,
  'Archiving a room frees a slot'
);
SELECT lives_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-00000000f003', 'Freed')$$,
  'A room can be created once a slot is freed'
);
SELECT throws_ok(
  $$SELECT update_sub_channel((SELECT id FROM sub_channels WHERE channel_id = '00000000-0000-0000-0000-00000000f003' AND name = 'R1'), NULL, false)$$,
  'P0001', NULL,
  'Restoring a room at the active cap is rejected'
);

-- Reserve "Main" so a room cannot collide with the Main tab label.
SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-00000000f001', 'Main')$$,
  'P0001', NULL,
  'A room cannot be named Main'
);
SELECT throws_ok(
  $$SELECT create_sub_channel('00000000-0000-0000-0000-00000000f001', '  main  ')$$,
  'P0001', NULL,
  'The reserved name is matched case- and whitespace-insensitively'
);
SELECT throws_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-000000300001', 'Main', NULL)$$,
  'P0001', NULL,
  'An existing room cannot be renamed to Main'
);

SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-000000300001', NULL, true)$$,
  'GM can archive a room'
);
SELECT is(
  (SELECT is_archived FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000300001'),
  true,
  'Archiving sets is_archived'
);
SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-000000300001', NULL, false)$$,
  'GM can restore a room'
);

-- ---- send_message / roll_dice room scoping ---------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
SELECT send_message('00000000-0000-0000-0000-00000000f001', 'room-send', 'regular', NULL, NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000300001');
SELECT is(
  (SELECT sub_channel_id FROM messages WHERE content = 'room-send'),
  '00000000-0000-0000-0000-000000300001'::uuid,
  'send_message stores the room'
);

SELECT send_message('00000000-0000-0000-0000-00000000f001', 'main-send', 'regular');
SELECT is(
  (SELECT sub_channel_id FROM messages WHERE content = 'main-send'),
  NULL,
  'Omitting the room lands on Main'
);

SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000f001', 'foreign', 'regular', NULL, NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000300002')$$,
  'P0001', NULL,
  'A room from another channel is rejected'
);

SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000f001', 'cross-reply', 'regular', '00000000-0000-0000-0000-000000400001', NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000300001')$$,
  'P0001', NULL,
  'A reply cannot cross rooms'
);

SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000f001', 'same-reply', 'regular', '00000000-0000-0000-0000-000000400002', NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000300001')$$,
  'A reply to a message in the same room is allowed'
);

SELECT roll_dice('00000000-0000-0000-0000-00000000f001', '1d20', NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000300001');
SELECT is(
  (SELECT sub_channel_id FROM messages WHERE type = 'dice_roll'),
  '00000000-0000-0000-0000-000000300001'::uuid,
  'roll_dice stores the room'
);

SELECT throws_ok(
  $$SELECT delete_sub_channel('00000000-0000-0000-0000-000000300001')$$,
  'P0001', NULL,
  'A room with messages cannot be deleted'
);

-- ---- per-room unread -------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
SELECT is(
  (SELECT unread_count FROM get_channel_room_unread('00000000-0000-0000-0000-00000000f001') WHERE sub_channel_id IS NULL),
  1::bigint,
  'Main unread is returned as the NULL group'
);
SELECT is(
  (SELECT unread_count FROM get_channel_room_unread('00000000-0000-0000-0000-00000000f001') WHERE sub_channel_id = '00000000-0000-0000-0000-000000300001'),
  1::bigint,
  'A room unread count reflects the room''s unread messages'
);
SELECT lives_ok(
  $$SELECT mark_sub_channel_read('00000000-0000-0000-0000-000000300001')$$,
  'A member can mark a room read'
);
SELECT is(
  (SELECT unread_count FROM get_channel_room_unread('00000000-0000-0000-0000-00000000f001') WHERE sub_channel_id = '00000000-0000-0000-0000-000000300001'),
  0::bigint,
  'Marking a room read clears its unread'
);

-- ---- RLS backstop + routing immutability -----------------------------------
SELECT throws_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id) VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'regular', 'raw', '00000000-0000-0000-0000-000000300002')$$,
  '42501', NULL,
  'A direct insert cannot point at another channel''s room'
);
SELECT lives_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id) VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'regular', 'raw-ok', '00000000-0000-0000-0000-000000300001')$$,
  'A direct insert into an own-channel room is allowed'
);
-- Run as the message's sender: another member's UPDATE is filtered by RLS and
-- would never reach the BEFORE UPDATE trigger.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE messages SET sub_channel_id = NULL WHERE id = '00000000-0000-0000-0000-000000400002'$$,
  'P0001', NULL,
  'A message cannot be moved between rooms'
);

SELECT * FROM finish();
ROLLBACK;
