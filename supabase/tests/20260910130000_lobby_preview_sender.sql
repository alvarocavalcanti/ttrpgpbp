-- #468: lobby preview sender prefix. Locks the trigger's label resolution
-- (npc_name > character_name > display_name, no label = content only, whisper
-- = NULL) and the historical backfill (sender-prefixed rewrite, whisper or
-- created_at tie resolves to NULL).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000700', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm468@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hero468@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pat468@test.com', '', now(), '{}', '{}', now(), now());

-- handle_new_user creates these profile rows; Pat has no character name.
UPDATE profiles SET display_name = 'Pat' WHERE id = '00000000-0000-0000-0000-000000000702';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000710', 'Preview labels', '00000000-0000-0000-0000-000000000700', 'abcdef68');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000720', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000701', 'Hero', now()),
  ('00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000702', '', now());

-- 1. character_name label.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000730', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000701', 'regular', 'I attack');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  'Hero: I attack',
  'preview uses the sender character_name'
);

-- 2. Empty character_name falls through to display_name.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000702', 'regular', 'I hide');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  'Pat: I hide',
  'empty character_name falls back to display_name'
);

-- 3. NPC message (sender_id NULL) uses npc_name.
INSERT INTO messages (id, channel_id, sender_id, type, content, npc_name)
VALUES ('00000000-0000-0000-0000-000000000732', '00000000-0000-0000-0000-000000000710', NULL, 'regular', 'Grr', 'Goblin');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  'Goblin: Grr',
  'NPC messages are labelled with npc_name'
);

-- 4. npc_name wins even when a sender is present (matches chat rendering).
INSERT INTO messages (id, channel_id, sender_id, type, content, npc_name)
VALUES ('00000000-0000-0000-0000-000000000733', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000701', 'regular', 'Boo', 'Goblin');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  'Goblin: Boo',
  'npc_name takes precedence over the character name'
);

-- 5. System message (no sender, no npc_name) stays unprefixed.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000734', '00000000-0000-0000-0000-000000000710', NULL, 'system', 'Hero joined the channel');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  'Hero joined the channel',
  'system messages are not prefixed'
);

-- 6. Whisper leaves the preview NULL (no leak, #406).
INSERT INTO messages (id, channel_id, sender_id, type, content, whisper_to)
VALUES ('00000000-0000-0000-0000-000000000735', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000701', 'regular', 'secret', '00000000-0000-0000-0000-000000000700');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  NULL,
  'whisper inserts keep the preview NULL'
);

-- 7. Backfill rewrites a legacy (unprefixed) preview with the sender label.
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000711', 'Backfill', '00000000-0000-0000-0000-000000000700', 'abcdef69');
INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES ('00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000701', 'Hero', now());
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000740', '00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000701', 'regular', 'Legacy text');
-- Simulate the pre-#468 preview shape.
UPDATE channels SET last_message_preview = left('Legacy text', 120)
WHERE id = '00000000-0000-0000-0000-000000000711';

UPDATE public.channels c
SET last_message_preview = (
  SELECT CASE
    WHEN s.label IS NULL THEN left(s.content, 120)
    ELSE left(s.label || ': ' || s.content, 120)
  END
  FROM (
    SELECT m.content,
           coalesce(
             nullif(m.npc_name, ''),
             nullif(cm.character_name, ''),
             p.display_name
           ) AS label
    FROM public.messages m
    LEFT JOIN public.channel_members cm
      ON cm.channel_id = c.id AND cm.user_id = m.sender_id
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.channel_id = c.id
      AND m.created_at = c.last_message_at
      AND m.whisper_to IS NULL
      AND (SELECT count(*) FROM public.messages m2
            WHERE m2.channel_id = c.id
              AND m2.created_at = c.last_message_at) = 1
  ) s
  LIMIT 1
)
WHERE c.last_message_at IS NOT NULL;

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000711'),
  'Hero: Legacy text',
  'backfill rewrites a legacy preview with the sender prefix'
);

-- 8. A created_at tie resolves to NULL (safe direction).
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000712', 'Tie', '00000000-0000-0000-0000-000000000700', 'abcdef70');
INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000750', '00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000701', 'regular', 'tie one', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000701', 'regular', 'tie two', now() - interval '1 hour');

UPDATE public.channels c
SET last_message_preview = (
  SELECT CASE
    WHEN s.label IS NULL THEN left(s.content, 120)
    ELSE left(s.label || ': ' || s.content, 120)
  END
  FROM (
    SELECT m.content,
           coalesce(
             nullif(m.npc_name, ''),
             nullif(cm.character_name, ''),
             p.display_name
           ) AS label
    FROM public.messages m
    LEFT JOIN public.channel_members cm
      ON cm.channel_id = c.id AND cm.user_id = m.sender_id
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.channel_id = c.id
      AND m.created_at = c.last_message_at
      AND m.whisper_to IS NULL
      AND (SELECT count(*) FROM public.messages m2
            WHERE m2.channel_id = c.id
              AND m2.created_at = c.last_message_at) = 1
  ) s
  LIMIT 1
)
WHERE c.last_message_at IS NOT NULL;

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000712'),
  NULL,
  'backfill resolves a created_at tie to NULL'
);

-- 9. A stale preview whose producing message is a whisper is nulled.
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000713', 'Whisper latest', '00000000-0000-0000-0000-000000000700', 'abcdef71');
INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
VALUES ('00000000-0000-0000-0000-000000000760', '00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000701', 'regular', 'visible', now() - interval '1 hour');
INSERT INTO messages (id, channel_id, sender_id, type, content, whisper_to, created_at)
VALUES ('00000000-0000-0000-0000-000000000761', '00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000701', 'regular', 'secret', '00000000-0000-0000-0000-000000000700', now());
UPDATE channels SET last_message_preview = 'Hero: visible'
WHERE id = '00000000-0000-0000-0000-000000000713';

UPDATE public.channels c
SET last_message_preview = (
  SELECT CASE
    WHEN s.label IS NULL THEN left(s.content, 120)
    ELSE left(s.label || ': ' || s.content, 120)
  END
  FROM (
    SELECT m.content,
           coalesce(
             nullif(m.npc_name, ''),
             nullif(cm.character_name, ''),
             p.display_name
           ) AS label
    FROM public.messages m
    LEFT JOIN public.channel_members cm
      ON cm.channel_id = c.id AND cm.user_id = m.sender_id
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.channel_id = c.id
      AND m.created_at = c.last_message_at
      AND m.whisper_to IS NULL
      AND (SELECT count(*) FROM public.messages m2
            WHERE m2.channel_id = c.id
              AND m2.created_at = c.last_message_at) = 1
  ) s
  LIMIT 1
)
WHERE c.last_message_at IS NOT NULL;

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000713'),
  NULL,
  'backfill nulls a preview whose producing message is a whisper'
);

SELECT * FROM finish();
ROLLBACK;
