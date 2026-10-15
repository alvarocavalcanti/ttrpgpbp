-- #621 Phase 4: the lobby preview leads with the room name for a room message.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lobbygm@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000f201', 'Lobby', '00000000-0000-0000-0000-00000000f101', 'fab00001');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f101', 'Hero');

INSERT INTO sub_channels (id, channel_id, name, created_by)
VALUES ('00000000-0000-0000-0000-00000000f401', '00000000-0000-0000-0000-00000000f201', 'OOC', '00000000-0000-0000-0000-00000000f101');

-- Room message: room name leads, sender follows.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f101', 'regular', 'hello', '00000000-0000-0000-0000-00000000f401');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000f201'),
  'OOC · Hero: hello',
  'A room message leads the preview with the room name'
);

-- Main message: unchanged (sender prefix only).
INSERT INTO messages (channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f101', 'regular', 'main hello');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000f201'),
  'Hero: main hello',
  'A Main message keeps the sender prefix only'
);

-- A system message in a room has no sender label.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000f201', NULL, 'system', 'joined', '00000000-0000-0000-0000-00000000f401');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000f201'),
  'OOC · joined',
  'A label-less room message leads with the room name only'
);

-- Whisper: no preview (#406).
INSERT INTO messages (channel_id, sender_id, type, content, whisper_to)
VALUES ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f101', 'regular', 'psst', '00000000-0000-0000-0000-00000000f101');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000f201'),
  NULL,
  'A whisper leaves no preview'
);

-- Long room message: the cap holds and keeps the room prefix.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f101', 'regular', repeat('x', 200), '00000000-0000-0000-0000-00000000f401');
SELECT is(
  (SELECT length(last_message_preview) FROM channels WHERE id = '00000000-0000-0000-0000-00000000f201'),
  120,
  'The preview is capped at 120 characters'
);
SELECT is(
  (SELECT left(last_message_preview, 3) FROM channels WHERE id = '00000000-0000-0000-0000-00000000f201'),
  'OOC',
  'The room prefix survives the cap'
);

SELECT * FROM finish();
ROLLBACK;
