-- Issue #811: the NPC portrait picker stored Iconify search results as
-- .../game-icons/game-icons:<id>.svg (404). The migration repairs those rows in
-- channel_npcs.avatar_url and messages.npc_avatar_url. Locks:
--   * the repair is not blocked by the message-immutability triggers (they only
--     guard JWT-bearing writes);
--   * only the doubled segment is rewritten, so relative storage paths, plain
--     https URLs and NULL survive untouched;
--   * re-running the UPDATE pair changes nothing (idempotent).
-- The migration already applied during db reset, so legacy rows are written
-- directly and the exact UPDATE body is re-run against them.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000481101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm811@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id)
VALUES ('00000000-0000-0000-0000-000000481111', 'NPC icon repair', '00000000-0000-0000-0000-000000481101');

INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000481111', '00000000-0000-0000-0000-000000481101', 'GM');

-- Legacy shape: one corrupted portrait plus the three shapes that must survive.
INSERT INTO channel_npcs (id, channel_id, name, avatar_url)
VALUES
  ('00000000-0000-0000-0000-000000481121', '00000000-0000-0000-0000-000000481111', 'Corrupted',
   'https://api.iconify.design/game-icons/game-icons:dragon-head.svg'),
  ('00000000-0000-0000-0000-000000481122', '00000000-0000-0000-0000-000000481111', 'Valid icon',
   'https://api.iconify.design/game-icons/goblin-head.svg'),
  ('00000000-0000-0000-0000-000000481123', '00000000-0000-0000-0000-000000481111', 'Uploaded',
   'https://cdn.example.com/npc/uploaded.png'),
  ('00000000-0000-0000-0000-000000481124', '00000000-0000-0000-0000-000000481111', 'Storage',
   '00000000-0000-0000-0000-000000481111/npc/wisp.png');

INSERT INTO messages (id, channel_id, sender_id, type, content, npc_avatar_url)
VALUES
  ('00000000-0000-0000-0000-000000481131', '00000000-0000-0000-0000-000000481111', '00000000-0000-0000-0000-000000481101',
   'regular', 'corrupted snapshot',
   'https://api.iconify.design/game-icons/game-icons:dragon-head.svg'),
  ('00000000-0000-0000-0000-000000481132', '00000000-0000-0000-0000-000000481111', '00000000-0000-0000-0000-000000481101',
   'regular', 'valid snapshot', 'https://api.iconify.design/game-icons/goblin-head.svg'),
  ('00000000-0000-0000-0000-000000481133', '00000000-0000-0000-0000-000000481111', '00000000-0000-0000-0000-000000481101',
   'regular', 'no snapshot', NULL);

-- ===== 1. The repair runs against message rows =====
SELECT lives_ok(
  $$UPDATE public.channel_npcs
    SET avatar_url = replace(avatar_url, '/game-icons/game-icons:', '/game-icons/')
    WHERE avatar_url LIKE '%api.iconify.design/game-icons/game-icons:%'$$,
  'channel_npcs repair is allowed'
);

SELECT lives_ok(
  $$UPDATE public.messages
    SET npc_avatar_url = replace(npc_avatar_url, '/game-icons/game-icons:', '/game-icons/')
    WHERE npc_avatar_url LIKE '%api.iconify.design/game-icons/game-icons:%'$$,
  'messages repair is not blocked by the immutability triggers'
);

-- ===== 2. Corrupted rows are repaired =====
SELECT is(
  (SELECT avatar_url FROM channel_npcs WHERE id = '00000000-0000-0000-0000-000000481121'),
  'https://api.iconify.design/game-icons/dragon-head.svg',
  'corrupted NPC portrait is rewritten to a single collection segment'
);

SELECT is(
  (SELECT npc_avatar_url FROM messages WHERE id = '00000000-0000-0000-0000-000000481131'),
  'https://api.iconify.design/game-icons/dragon-head.svg',
  'corrupted message snapshot is rewritten too'
);

-- ===== 3. Everything else is untouched =====
SELECT is(
  (SELECT avatar_url FROM channel_npcs WHERE id = '00000000-0000-0000-0000-000000481122'),
  'https://api.iconify.design/game-icons/goblin-head.svg',
  'a healthy icon URL is left alone'
);

SELECT is(
  (SELECT avatar_url FROM channel_npcs WHERE id = '00000000-0000-0000-0000-000000481123'),
  'https://cdn.example.com/npc/uploaded.png',
  'an uploaded-image URL is left alone'
);

SELECT is(
  (SELECT avatar_url FROM channel_npcs WHERE id = '00000000-0000-0000-0000-000000481124'),
  '00000000-0000-0000-0000-000000481111/npc/wisp.png',
  'a relative storage path is left alone'
);

SELECT is(
  (SELECT npc_avatar_url FROM messages WHERE id = '00000000-0000-0000-0000-000000481133'),
  NULL,
  'a NULL snapshot stays NULL'
);

-- ===== 4. Idempotency =====
UPDATE public.channel_npcs
SET avatar_url = replace(avatar_url, '/game-icons/game-icons:', '/game-icons/')
WHERE avatar_url LIKE '%api.iconify.design/game-icons/game-icons:%';

UPDATE public.messages
SET npc_avatar_url = replace(npc_avatar_url, '/game-icons/game-icons:', '/game-icons/')
WHERE npc_avatar_url LIKE '%api.iconify.design/game-icons/game-icons:%';

SELECT is(
  (SELECT count(*) FROM channel_npcs WHERE avatar_url LIKE '%/game-icons/game-icons:%')
  + (SELECT count(*) FROM messages WHERE npc_avatar_url LIKE '%/game-icons/game-icons:%'),
  0::bigint,
  'a second run leaves no doubled segment behind'
);

SELECT * FROM finish();
ROLLBACK;
