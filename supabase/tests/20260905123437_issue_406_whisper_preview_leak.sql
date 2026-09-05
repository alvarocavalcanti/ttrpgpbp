-- Issue #406 [P0]: whispers leaked into channels.last_message_preview. The
-- trigger copied the first 120 chars of every message onto the member-readable
-- channels row, bypassing messages RLS. Locks the trigger contract:
--   * a whisper insert leaves last_message_preview NULL (no leak)
--   * last_message_at still advances on whisper inserts (unread counts)
--   * a non-whisper insert fills the preview as before (capped at 120 chars)
--   * a whisper arriving after a regular message clears the preview rather
--     than leaving stale (but non-leaking) content behind
--   * the historical scrub NULLs only previews produced by a whisper: a later
--     regular message with identical content keeps its preview (collision)

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

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

-- Historical scrub (mirrors the migration's UPDATE): the backfill copied the
-- latest message's first 120 chars, so simulate that legacy state by writing
-- the preview directly (the insert trigger never touches this path again) and
-- re-running the scrub statement.
--
-- Collision case: whisper posted first, then a regular message whose content
-- starts identically. The preview is legitimately the regular message's — the
-- scrub must preserve it because last_message_at points at the regular one.
-- (Explicit created_at values: now() is transaction-stable, so separate
-- requests are simulated with distinct timestamps — matching how one message
-- per RPC call lands in production.)
INSERT INTO messages (id, channel_id, sender_id, type, content, whisper_to, created_at)
VALUES ('00000000-0000-0000-0000-000000000433', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', 'shared opening text :: whisper edition', '00000000-0000-0000-0000-000000000400', now() - interval '40 seconds');

INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
VALUES ('00000000-0000-0000-0000-000000000434', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', 'shared opening text :: regular edition', now() - interval '20 seconds');

UPDATE channels SET last_message_preview = left('shared opening text :: regular edition', 120)
WHERE id = '00000000-0000-0000-0000-000000000410';

UPDATE channels c
SET last_message_preview = null
WHERE EXISTS (
  SELECT 1
  FROM messages m
  WHERE m.channel_id = c.id
    AND m.created_at = c.last_message_at
    AND m.whisper_to IS NOT NULL
);

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000410'),
  'shared opening text :: regular edition',
  'scrub preserves a valid preview from a later regular message with identical content'
);

-- Whisper-latest case: preview copied from a whisper (legacy leak shape) is
-- scrubbed to NULL.
UPDATE channels SET last_message_preview = left('shared opening text :: whisper edition', 120),
                    last_message_at = (SELECT created_at FROM messages WHERE id = '00000000-0000-0000-0000-000000000433')
WHERE id = '00000000-0000-0000-0000-000000000410';

UPDATE channels c
SET last_message_preview = null
WHERE EXISTS (
  SELECT 1
  FROM messages m
  WHERE m.channel_id = c.id
    AND m.created_at = c.last_message_at
    AND m.whisper_to IS NOT NULL
);

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000410'),
  NULL,
  'scrub NULLs a preview produced by a whisper'
);

SELECT * FROM finish();
ROLLBACK;
