-- Issue #406 [P0]: whispers leaked into channels.last_message_preview. The
-- trigger copied the first 120 chars of every message onto the member-readable
-- channels row, bypassing messages RLS. Locks the trigger contract:
--   * a whisper insert leaves last_message_preview NULL (no leak)
--   * last_message_at still advances on whisper inserts (unread counts)
--   * a non-whisper insert fills the preview as before (capped at 120 chars)
--   * a whisper arriving after a regular message clears the preview rather
--     than leaving stale (but non-leaking) content behind

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm406@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p406@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000410', 'Preview leak', '00000000-0000-0000-0000-000000000400', 'abcdef13');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000400', 'GM', now()),
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'P1', now());

-- Regular message fills the preview.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000430', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', 'I attack the darkness!');

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000410'),
  'I attack the darkness!',
  'regular message fills the preview'
);

-- Whisper insert: preview goes NULL, timestamp still advances.
INSERT INTO messages (id, channel_id, sender_id, type, content, whisper_to)
VALUES ('00000000-0000-0000-0000-000000000431', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', 'secret whisper content', '00000000-0000-0000-0000-000000000400');

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000410'),
  NULL,
  'whisper insert leaves the preview NULL (no leak)'
);

SELECT ok(
  (SELECT last_message_at = (SELECT created_at FROM messages WHERE id = '00000000-0000-0000-0000-000000000431')
   FROM channels WHERE id = '00000000-0000-0000-0000-000000000410'),
  'whisper insert still advances last_message_at for unread counts'
);

-- Long content is capped at 120 chars.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000432', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', repeat('x', 200));

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000410'),
  repeat('x', 120),
  'regular preview stays capped at 120 chars'
);

SELECT * FROM finish();
ROLLBACK;
