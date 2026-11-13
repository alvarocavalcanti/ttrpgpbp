-- #806: mark_message_unread rewinds the reader's mark for the message's
-- surface so the message (and everything after it) counts as unread.
--
-- Unread is derived from read marks, so this file pins the mark arithmetic
-- rather than a stored flag:
--   * Main writes channel_members.main_last_read_at only, one microsecond
--     before the message;
--   * a room writes sub_channel_reads;
--   * LEAST keeps an already-earlier mark (older unread messages stay unread)
--     and a mark never moves forward;
--   * own, deleted, hidden-room, unaddressed-whisper and non-member messages
--     are refused, because the counters exclude them too.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(16);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-gm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-p1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-out@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000fb01', 'Unread', '00000000-0000-0000-0000-00000000fa01', 'fab00001');

-- The viewer has read everything up to a minute ago, so the history below
-- starts fully read and each mark-unread is the only source of unread.
INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at, joined_at)
VALUES
  ('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'GM', now() - interval '1 minute', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa02', 'P1', now() - interval '1 minute', now() - interval '3 hours');

INSERT INTO sub_channels (id, channel_id, name, created_by, visibility)
VALUES
  ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fb01', 'Battle', '00000000-0000-0000-0000-00000000fa01', 'all'),
  ('00000000-0000-0000-0000-00000000fc02', '00000000-0000-0000-0000-00000000fb01', 'GMOps', '00000000-0000-0000-0000-00000000fa01', 'gm');

INSERT INTO sub_channel_reads (sub_channel_id, user_id, last_read_at)
VALUES ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fa02', now() - interval '1 minute');

INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id, whisper_to, created_at, is_deleted)
VALUES
  ('00000000-0000-0000-0000-00000000fe01', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'regular', 'main-old', NULL, NULL, now() - interval '100 minutes', false),
  ('00000000-0000-0000-0000-00000000fe02', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'regular', 'main-new', NULL, NULL, now() - interval '40 minutes', false),
  ('00000000-0000-0000-0000-00000000fe03', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa02', 'regular', 'main-own', NULL, NULL, now() - interval '30 minutes', false),
  ('00000000-0000-0000-0000-00000000fe04', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'regular', 'main-deleted', NULL, NULL, now() - interval '20 minutes', true),
  ('00000000-0000-0000-0000-00000000fe05', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'regular', 'main-whisper', NULL, '00000000-0000-0000-0000-00000000fa03', now() - interval '55 minutes', false),
  ('00000000-0000-0000-0000-00000000fe06', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'regular', 'room-msg', '00000000-0000-0000-0000-00000000fc01', NULL, now() - interval '45 minutes', false),
  ('00000000-0000-0000-0000-00000000fe07', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa02', 'regular', 'room-own', '00000000-0000-0000-0000-00000000fc01', NULL, now() - interval '35 minutes', false),
  ('00000000-0000-0000-0000-00000000fe08', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'regular', 'gm-ops-msg', '00000000-0000-0000-0000-00000000fc02', NULL, now() - interval '25 minutes', false);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000fa02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated"}', true);

SELECT is(
  (SELECT unread_count FROM get_user_channels_unread('00000000-0000-0000-0000-00000000fa02')
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'),
  0::bigint,
  'the viewer starts with nothing unread'
);

SELECT lives_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe02')$$,
  'a member can mark another member''s message unread'
);

SELECT is(
  (SELECT main_last_read_at FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'
      AND user_id = '00000000-0000-0000-0000-00000000fa02'),
  (SELECT created_at - interval '1 microsecond' FROM messages
    WHERE id = '00000000-0000-0000-0000-00000000fe02'),
  'Main''s mark lands one microsecond before the message'
);

SELECT is(
  (SELECT last_read_at FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'
      AND user_id = '00000000-0000-0000-0000-00000000fa02') > (SELECT main_last_read_at FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'
      AND user_id = '00000000-0000-0000-0000-00000000fa02'),
  true,
  'last_read_at (the room divider mark) is left alone'
);

SELECT is(
  (SELECT unread_count FROM get_user_channels_unread('00000000-0000-0000-0000-00000000fa02')
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'),
  1::bigint,
  'the marked message counts as unread, and own/deleted/hidden ones do not'
);

SELECT lives_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe01')$$,
  'an older message can be marked unread too'
);

SELECT is(
  (SELECT unread_count FROM get_user_channels_unread('00000000-0000-0000-0000-00000000fa02')
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'),
  2::bigint,
  'marking an older message widens the unread range'
);

SELECT lives_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe02')$$,
  'marking an already-unread message is allowed'
);

SELECT is(
  (SELECT main_last_read_at FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-00000000fb01'
      AND user_id = '00000000-0000-0000-0000-00000000fa02'),
  (SELECT created_at - interval '1 microsecond' FROM messages
    WHERE id = '00000000-0000-0000-0000-00000000fe01'),
  'a mark never moves forward past messages that are still unread'
);

SELECT lives_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe06')$$,
  'a room message writes that room''s read row'
);

SELECT is(
  (SELECT last_read_at FROM sub_channel_reads
    WHERE sub_channel_id = '00000000-0000-0000-0000-00000000fc01'
      AND user_id = '00000000-0000-0000-0000-00000000fa02'),
  (SELECT created_at - interval '1 microsecond' FROM messages
    WHERE id = '00000000-0000-0000-0000-00000000fe06'),
  'the room mark lands one microsecond before the message'
);

SELECT is(
  (SELECT unread_count FROM get_channel_room_unread('00000000-0000-0000-0000-00000000fb01')
    WHERE sub_channel_id = '00000000-0000-0000-0000-00000000fc01'),
  1::bigint,
  'the room tab shows the marked message as unread'
);

SELECT throws_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe03')$$,
  'P0001',
  'You cannot mark your own message as unread.',
  'own messages are refused (the counters exclude them)'
);

SELECT throws_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe04')$$,
  'P0001',
  'Message not found.',
  'deleted messages are refused'
);

SELECT throws_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe05')$$,
  'P0001',
  'Message not found.',
  'a whisper between other members is refused'
);

SELECT throws_ok(
  $$SELECT mark_message_unread('00000000-0000-0000-0000-00000000fe08')$$,
  'P0001',
  'Message not found.',
  'a GM-only room message is refused for a player'
);

SELECT * FROM finish();
ROLLBACK;
