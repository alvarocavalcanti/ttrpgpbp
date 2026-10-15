-- #621 Phase 4 review (PR #724): a restricted-room message must not reach the
-- channel-wide lobby preview, and the repair clears a legacy disclosure.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prevgm@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000c201', 'Prev', '00000000-0000-0000-0000-00000000c101', 'fab00003');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c101', 'Hero');

INSERT INTO sub_channels (id, channel_id, name, created_by, visibility) VALUES
  ('00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000c201', 'OOC', '00000000-0000-0000-0000-00000000c101', 'all'),
  ('00000000-0000-0000-0000-00000000c402', '00000000-0000-0000-0000-00000000c201', 'GM Notes', '00000000-0000-0000-0000-00000000c101', 'gm'),
  ('00000000-0000-0000-0000-00000000c403', '00000000-0000-0000-0000-00000000c201', 'Secret', '00000000-0000-0000-0000-00000000c101', 'private');

-- Private room: nothing reaches the channel-wide preview.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c101', 'regular', 'psst secret', '00000000-0000-0000-0000-00000000c403');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000c201'),
  NULL,
  'A private-room message leaves no channel-wide preview'
);

-- GM-only room: same.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c101', 'regular', 'gm only', '00000000-0000-0000-0000-00000000c402');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000c201'),
  NULL,
  'A GM-only room message leaves no channel-wide preview'
);

-- Open room: the room prefix stays.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c101', 'regular', 'hello', '00000000-0000-0000-0000-00000000c401');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000c201'),
  'OOC · Hero: hello',
  'An open room message keeps the room prefix'
);

-- Main: sender prefix only.
INSERT INTO messages (channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c101', 'regular', 'main hello');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000c201'),
  'Hero: main hello',
  'A Main message keeps the sender prefix'
);

-- A restricted-room system message is still hidden.
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000c201', NULL, 'system', 'joined', '00000000-0000-0000-0000-00000000c403');
SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000c201'),
  NULL,
  'A restricted-room system message leaves no preview'
);

-- Repair: a legacy restricted-room preview is cleared (same statement the
-- migration runs).
UPDATE channels SET last_message_preview = 'Secret · Hero: psst secret'
WHERE id = '00000000-0000-0000-0000-00000000c201';

UPDATE public.channels c
SET last_message_preview = (
  SELECT CASE
    WHEN s.room_visibility IS NOT NULL AND s.room_visibility <> 'all' THEN NULL
    WHEN s.room_name IS NOT NULL AND s.label IS NOT NULL
      THEN left(s.room_name || ' · ' || s.label || ': ' || s.content, 120)
    WHEN s.room_name IS NOT NULL
      THEN left(s.room_name || ' · ' || s.content, 120)
    WHEN s.label IS NOT NULL
      THEN left(s.label || ': ' || s.content, 120)
    ELSE left(s.content, 120)
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
           END AS label,
           sc.name AS room_name,
           sc.visibility AS room_visibility
    FROM public.messages m
    LEFT JOIN public.channel_members cm
      ON cm.channel_id = c.id AND cm.user_id = m.sender_id
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    LEFT JOIN public.sub_channels sc ON sc.id = m.sub_channel_id
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
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-00000000c201'),
  NULL,
  'The repair clears a legacy restricted-room preview'
);

SELECT * FROM finish();
ROLLBACK;
