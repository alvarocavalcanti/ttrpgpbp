-- Issue #348 regression: message sends rolled back in channels whose
-- avatar_url (or other URL columns) is a relative storage path, because the
-- enforce_url_scheme trigger required ^https?:// while the app intentionally
-- stores bare object paths signed at render time. Message inserts fire
-- on_message_inserted_last_message_at, which UPDATEs channels — so every
-- send_message in such a channel failed with
-- "URLs must start with http:// or https://".
--
-- Covers: relative storage paths accepted on channels UPDATE (and INSERT),
-- message send succeeds end-to-end on a channel with a relative avatar_url,
-- explicit non-http(s) schemes (javascript:, data:) still rejected.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000509', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test348gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test348a@example.com', '', now(), '{}', '{}', now(), now());

-- Channel stores its avatar as a bare storage object path (canonical since
-- 20260826160000): '<channel-id>/channel/<uuid>.jpg'.
INSERT INTO channels (id, name, gm_id, avatar_url)
VALUES ('00000000-0000-0000-0000-000000000510', 'Channel 348', '00000000-0000-0000-0000-000000000509',
  '00000000-0000-0000-0000-000000000510/channel/11111111-1111-1111-1111-111111111111.jpg');
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000510', 'Player A');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Channel UPDATE with relative storage paths lives =====
SELECT lives_ok(
  $$UPDATE channels SET last_message_at = now(), map_url = '00000000-0000-0000-0000-000000000510/map/22222222-2222-2222-2222-222222222222.jpg'
    WHERE id = '00000000-0000-0000-0000-000000000510'$$,
  'relative storage paths accepted on channels UPDATE'
);

-- ===== 2. Message send succeeds on the affected channel (the reported bug) =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000510');
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-000000000510', 'hello from the bug report', 'regular')$$,
  'send_message works on a channel with a relative avatar_url'
);

SELECT is(
  (SELECT count(*) FROM messages
   WHERE channel_id = '00000000-0000-0000-0000-000000000510' AND content = 'hello from the bug report'),
  1::bigint,
  'message persisted'
);

SELECT is(
  (SELECT last_message_at IS NOT NULL FROM channels WHERE id = '00000000-0000-0000-0000-000000000510'),
  true,
  'last_message_at updated by the message insert'
);

-- ===== 3. Dangerous schemes still rejected =====
SELECT throws_ok(
  $$UPDATE channels SET avatar_url = 'javascript:alert(1)'
    WHERE id = '00000000-0000-0000-0000-000000000510'$$,
  'URLs must start with http:// or https://'
);
SELECT throws_ok(
  $$UPDATE channels SET resources_url = 'data:text/html;base64,PHNjcmlwdD4='
    WHERE id = '00000000-0000-0000-0000-000000000510'$$,
  'URLs must start with http:// or https://'
);

SELECT * FROM finish();
ROLLBACK;
