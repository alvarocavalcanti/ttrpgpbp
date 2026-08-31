-- Issue #335: authz & enumeration hardening.
--
-- Covers: suspension guards on command RPCs, the join-attempt throttle,
-- PUBLIC revocation of definer helpers, get_admin_unread_count's
-- self/admin-only guard, and is_active_gm ignoring suspended GMs.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(19);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test335a@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000219', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test335b@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000220', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test335c@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test335d@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test335e@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000221';

-- 209 = GM of channel 210 (password protected); 219 & 220 are members.
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000210', 'Channel A', '00000000-0000-0000-0000-000000000209');
INSERT INTO channel_secrets (channel_id, password_hash) VALUES ('00000000-0000-0000-0000-000000000210', 'hash');
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000219', 'Player'),
  ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000220', 'Suspendee');

-- Channel 211 for throttle tests (GM 222).
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000211', 'Channel B', '00000000-0000-0000-0000-000000000222');
INSERT INTO channel_secrets (channel_id, password_hash) VALUES ('00000000-0000-0000-0000-000000000211', 'hash2');

-- Suspension flips must run as postgres: the #300 trigger blocks any
-- is_suspended change while a JWT context is set. Helper does both.
CREATE OR REPLACE FUNCTION pg_temp.set_suspended(p_uid uuid, p_val boolean)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', false);
  SELECT set_config('request.jwt.claims', '{}', false);
  UPDATE profiles SET is_suspended = p_val WHERE id = p_uid;
$$;

-- ===== 1. Suspended player cannot post or roll =====
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000000219', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000219', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000219","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-000000000210', 'hi')$$,
  'Account suspended.'
);
SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-000000000210', '1d20')$$,
  'Account suspended.'
);
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000000219', false);

-- ===== 2. Suspended GM cannot mutate channel state =====
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000000209', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000209', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000209","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT update_channel_settings('00000000-0000-0000-0000-000000000210', 'Renamed')$$,
  'Account suspended.'
);
SELECT throws_ok(
  $$SELECT set_active_players('00000000-0000-0000-0000-000000000210', ARRAY[]::uuid[])$$,
  'Account suspended.'
);

-- is_active_gm must stop counting suspended GMs (they still own channel 210).
SELECT is(is_active_gm('00000000-0000-0000-0000-000000000209'), false, 'suspended GM is not an active GM');
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000000209', false);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000209', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000209","role":"authenticated"}', true);
SELECT is(is_active_gm('00000000-0000-0000-0000-000000000209'), true, 'unsuspended GM is an active GM');

-- GM path still works after the guard (regression).
SELECT lives_ok(
  $$SELECT update_channel_settings('00000000-0000-0000-0000-000000000210', 'Renamed')$$,
  'unsuspended GM can update channel settings'
);

-- ===== 3. Whisper to a suspended member is rejected =====
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000000220', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000219', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000219","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-000000000210', 'psst', 'regular', NULL, '00000000-0000-0000-0000-000000000220')$$,
  'Whisper target is not a member of this channel.'
);
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000000220', false);

-- ===== 4. Join password/invite oracle is throttled =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000219', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000219","role":"authenticated"}', true);

-- Five wrong attempts burn the window.
DO $$ BEGIN
  FOR i IN 1..5 LOOP
    PERFORM join_channel('00000000-0000-0000-0000-000000000211', 'Char', NULL, NULL, 'wrong');
  END LOOP;
END $$;

-- Even the CORRECT password is now refused.
SELECT is(
  join_channel('00000000-0000-0000-0000-000000000211', 'Char', NULL, NULL, 'hash2'),
  '{"success": false, "error": "Too many failed attempts. Try again later."}'::jsonb,
  'throttled: correct password refused after 5 failures'
);

-- Window expiry lifts the block; correct password joins.
UPDATE channel_join_failures
SET window_start = now() - interval '11 minutes'
WHERE user_id = '00000000-0000-0000-0000-000000000219'
  AND channel_id = '00000000-0000-0000-0000-000000000211';
SELECT is(
  join_channel('00000000-0000-0000-0000-000000000211', 'Char', NULL, NULL, 'hash2'),
  '{"success": true}'::jsonb,
  'window expiry allows retry with correct password'
);

-- Success clears the failure counter.
SELECT is(
  (SELECT count(*) FROM channel_join_failures
   WHERE user_id = '00000000-0000-0000-0000-000000000219'
     AND channel_id = '00000000-0000-0000-0000-000000000211'),
  0::bigint,
  'successful join clears failure counter'
);

-- ===== 5. Definer helpers are no longer PUBLIC-executable =====
SELECT is(has_function_privilege('anon', 'public.is_suspended(uuid)', 'EXECUTE'), false, 'anon cannot call is_suspended');
SELECT is(has_function_privilege('authenticated', 'public.is_suspended(uuid)', 'EXECUTE'), false, 'authenticated cannot call is_suspended');
SELECT is(has_function_privilege('authenticated', 'public.resolve_mention_user_ids(uuid,text)', 'EXECUTE'), false, 'authenticated cannot call resolve_mention_user_ids');
-- Policies evaluate with caller privileges, so authenticated must keep EXECUTE.
SELECT is(has_function_privilege('authenticated', 'public.is_active_gm(uuid)', 'EXECUTE'), true, 'authenticated keeps is_active_gm (RLS policies use it)');
SELECT is(has_function_privilege('authenticated', 'public.get_admin_unread_count(uuid)', 'EXECUTE'), true, 'authenticated keeps get_admin_unread_count (own badge)');

-- ===== 6. get_admin_unread_count is self/admin-only =====
-- DM thread for 219, with an unread message from the admin.
INSERT INTO admin_threads (id, type, gm_id, created_by)
VALUES ('00000000-0000-0000-0000-000000000335', 'dm',
  '00000000-0000-0000-0000-000000000219', '00000000-0000-0000-0000-000000000221');
INSERT INTO admin_messages (thread_id, sender_id, content)
VALUES ('00000000-0000-0000-0000-000000000335', '00000000-0000-0000-0000-000000000221', 'hello');

SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000000219'),
  1,
  'caller sees own unread count'
);

-- Switch to a different non-admin caller: querying 219 (who HAS an unread
-- thread) must return 0 only because of the auth.uid() guard, not because
-- the target has no visible threads.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000220', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000220","role":"authenticated"}', true);
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000000219'),
  0,
  'non-admin cannot read another user''s unread count'
);

-- ===== 7. Admin can still query on behalf of others =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000221', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000221","role":"authenticated"}', true);
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000000219'),
  1,
  'server admin can query another user''s unread count'
);

SELECT * FROM finish();
ROLLBACK;
