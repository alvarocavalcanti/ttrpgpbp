-- #621 Phase 3: private rooms. visibility 'all' | 'gm' | 'private' gates the
-- room row, its messages, and posting; set_sub_channel_audience is GM-only.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(18);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'primgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'primm1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000ea03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'primm2@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000eb01', 'Private', '00000000-0000-0000-0000-00000000ea01', 'eab00001');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-00000000ed01', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', 'GM'),
  ('00000000-0000-0000-0000-00000000ed02', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea02', 'M1'),
  ('00000000-0000-0000-0000-00000000ed03', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea03', 'M2');

INSERT INTO sub_channels (id, channel_id, name, created_by, visibility)
VALUES
  ('00000000-0000-0000-0000-00000000ec01', '00000000-0000-0000-0000-00000000eb01', 'Open', '00000000-0000-0000-0000-00000000ea01', 'all'),
  ('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000eb01', 'Secret', '00000000-0000-0000-0000-00000000ea01', 'private'),
  ('00000000-0000-0000-0000-00000000ec03', '00000000-0000-0000-0000-00000000eb01', 'GMOnly', '00000000-0000-0000-0000-00000000ea01', 'gm');

INSERT INTO sub_channel_members (sub_channel_id, user_id, added_by)
VALUES ('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-00000000ea01');

INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id)
VALUES
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', 'regular', 'main', NULL),
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', 'regular', 'secret', '00000000-0000-0000-0000-00000000ec02');

-- Derived data hanging off the private room's message.
INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
VALUES ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', '1d20', 12, '{}'::jsonb);
INSERT INTO message_reactions (message_id, channel_id, user_id, emoji)
VALUES ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', '👍');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ---- room visibility -------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea03","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM sub_channels), 1::bigint, 'A non-invited member sees only the open room');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea02","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM sub_channels), 2::bigint, 'An invited member sees the open and the private room');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM sub_channels), 3::bigint, 'The GM sees every room, including the GM-only one');

-- ---- message visibility ----------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea03","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM messages WHERE sub_channel_id = '00000000-0000-0000-0000-00000000ec02'),
  0::bigint,
  'A non-invited member cannot read a private room''s messages'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE sub_channel_id IS NULL),
  1::bigint,
  'A non-invited member still reads Main'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea02","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM messages WHERE sub_channel_id = '00000000-0000-0000-0000-00000000ec02'),
  1::bigint,
  'An invited member reads the private room''s messages'
);

-- Derived data (#4): the parent message's room visibility gates rolls and
-- reactions too.
SELECT is((SELECT count(*) FROM dice_rolls), 1::bigint, 'An invited member reads the private room''s rolls');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea03","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM dice_rolls), 0::bigint, 'A non-viewer cannot read a private room''s rolls');
SELECT is((SELECT count(*) FROM message_reactions), 0::bigint, 'A non-viewer cannot read a private room''s reactions');
SELECT is(
  (SELECT count(*) FROM get_channel_room_unread('00000000-0000-0000-0000-00000000eb01') WHERE sub_channel_id = '00000000-0000-0000-0000-00000000ec02'),
  0::bigint,
  'A non-viewer gets no unread row for a private room'
);

-- ---- posting ---------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea03","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id) VALUES ('00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea03', 'regular', 'nope', '00000000-0000-0000-0000-00000000ec02')$$,
  'P0001', NULL,
  'A non-invited member cannot post into a private room'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea02","role":"authenticated"}', true);
SELECT lives_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id) VALUES ('00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea02', 'regular', 'hi', '00000000-0000-0000-0000-00000000ec02')$$,
  'An invited member can post into the private room'
);

-- ---- audience RPCs ---------------------------------------------------------
SELECT throws_ok(
  $$SELECT set_sub_channel_visibility('00000000-0000-0000-0000-00000000ec02', 'all')$$,
  'P0001', NULL,
  'A non-GM cannot change a room''s audience'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT set_sub_channel_visibility('00000000-0000-0000-0000-00000000ec02', 'private')$$,
  'The GM can set the room audience'
);
SELECT lives_ok(
  $$SELECT add_sub_channel_member('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000ea03')$$,
  'The GM can invite a member'
);
SELECT lives_ok(
  $$SELECT remove_sub_channel_member('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000ea02')$$,
  'The GM can remove an invited member'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea03","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM sub_channels), 2::bigint, 'The newly invited member now sees the private room');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea02","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM sub_channels), 1::bigint, 'The removed member no longer sees the private room');

SELECT * FROM finish();
ROLLBACK;
