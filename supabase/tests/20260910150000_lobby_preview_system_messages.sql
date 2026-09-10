-- #468 review follow-up: a system message with a populated sender_id (as
-- join_channel writes) must not get the sender prefix, and the backfill must
-- correct legacy prefixed system previews.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000800', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm468b@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hero468b@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000000810', 'System labels', '00000000-0000-0000-0000-000000000800', 'abcdef72'),
  ('00000000-0000-0000-0000-000000000811', 'System backfill', '00000000-0000-0000-0000-000000000800', 'abcdef73');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000820', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000801', 'Hero', now()),
  ('00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000801', 'Hero', now());

-- 1. System message with a sender is not prefixed (join_channel shape).
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000830', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000801', 'system', 'Hero joined the channel');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000810'),
  'Hero joined the channel',
  'system message with a sender_id stays unprefixed'
);

-- 2. A regular message from the same sender is still prefixed.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000831', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000801', 'regular', 'hello table');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000810'),
  'Hero: hello table',
  'regular messages keep the sender prefix'
);

-- 3. Backfill rewrites a legacy prefixed system preview.
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000840', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000801', 'system', 'Hero joined the channel');
UPDATE channels SET last_message_preview = 'Hero: Hero joined the channel'
WHERE id = '00000000-0000-0000-0000-000000000811';

UPDATE public.channels c
SET last_message_preview = (
  SELECT CASE
    WHEN s.label IS NULL THEN left(s.content, 120)
    ELSE left(s.label || ': ' || s.content, 120)
  END
  FROM (
    SELECT m.content,
           CASE
             WHEN m.type = 'system' THEN NULL
             ELSE coalesce(
               nullif(m.npc_name, ''),
               nullif(cm.character_name, ''),
               p.display_name
             )
           END AS label
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
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000811'),
  'Hero joined the channel',
  'backfill strips the prefix from a legacy system preview'
);

SELECT * FROM finish();
ROLLBACK;
