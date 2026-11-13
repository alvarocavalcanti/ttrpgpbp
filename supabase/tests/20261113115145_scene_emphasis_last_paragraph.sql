-- #806: the scene closing-paragraph emphasis is per message.
--
-- The column defaults to true so every scene written before this change keeps
-- the styling it always had, and send_message threads the GM's choice through
-- (default true when the caller knows nothing about it, i.e. an older bundle).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(11);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scene-gm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scene-p1@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000eb01', 'Scenes', '00000000-0000-0000-0000-00000000ea01', 'eab00001');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-00000000ed01', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', 'GM'),
  ('00000000-0000-0000-0000-00000000ed02', '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea02', 'P1');

-- The default is what keeps unmodified scenes (and direct inserts) styled.
SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'emphasize_last_paragraph'),
  'true',
  'emphasize_last_paragraph defaults to true'
);

SELECT isnt(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'emphasize_last_paragraph'),
  'YES',
  'emphasize_last_paragraph is NOT NULL'
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ea01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

-- Scene, caller omits the parameter: emphasized, like before #806.
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000eb01', 'A scene.', 'scene')$$,
  'GM sends a scene without the emphasis parameter'
);
SELECT is(
  (SELECT emphasize_last_paragraph FROM messages WHERE content = 'A scene.'),
  true,
  'a scene sent without the parameter is emphasized'
);

-- Scene, GM explicitly turns it off.
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000eb01', 'A plain scene.', 'scene', NULL, NULL, NULL, NULL, NULL, NULL, NULL, false)$$,
  'GM sends a scene with the emphasis turned off'
);
SELECT is(
  (SELECT emphasize_last_paragraph FROM messages WHERE content = 'A plain scene.'),
  false,
  'the choice is persisted on the message'
);

-- Regular messages ignore the flag (true is the column default); carrying it
-- must not be rejected, or a retried payload could never replay.
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-00000000eb01', 'Just talking.', 'regular', NULL, NULL, NULL, NULL, NULL, NULL, NULL, false)$$,
  'a regular message may carry the flag without error'
);
SELECT is(
  (SELECT emphasize_last_paragraph FROM messages WHERE content = 'Just talking.'),
  true,
  'the flag does not affect regular messages'
);

-- Idempotent replay: a retried send must return the ORIGINAL row, so the
-- emphasis choice made the first time cannot be overwritten by a replay that
-- carries a different value.
SELECT is(
  (SELECT message_id FROM send_message(
    '00000000-0000-0000-0000-00000000eb01', 'A retried scene.', 'scene',
    NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000ef01', NULL, false
  )),
  (SELECT message_id FROM send_message(
    '00000000-0000-0000-0000-00000000eb01', 'A retried scene.', 'scene',
    NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-00000000ef01', NULL, true
  )),
  'a replayed send returns the same message id'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE client_request_id = '00000000-0000-0000-0000-00000000ef01'),
  1::bigint,
  'a replayed send leaves exactly one row behind'
);
SELECT is(
  (SELECT emphasize_last_paragraph FROM messages WHERE client_request_id = '00000000-0000-0000-0000-00000000ef01'),
  false,
  'the replayed send keeps the emphasis choice made the first time'
);

SELECT * FROM finish();
ROLLBACK;
