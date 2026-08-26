BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Issue #302: whisper/mention privacy + push retry routing. Covers the DB
-- hardening (fabricated mention_user_ids rejected on direct insert) and the
-- admin-message retry path.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue302-admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue302-gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue302-p1@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue302-outsider@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000501';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000510', 'Issue 302', '00000000-0000-0000-0000-000000000502', 'issue302');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000520', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000502', 'GM', now()),
  ('00000000-0000-0000-0000-000000000521', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000503', 'P1', now());

SELECT plan(7);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- ==========================================
-- 1. Direct insert cannot fabricate mention_user_ids
-- ==========================================
-- A member cannot route a push to a non-member via the mention list.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO public.messages (channel_id, sender_id, type, content, mention_user_ids)
    VALUES ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000503', 'regular', 'hi [@Outsider](user:00000000-0000-0000-0000-000000000504)',
            ARRAY['00000000-0000-0000-0000-000000000504']::uuid[])$$,
  '42501',
  NULL,
  'insert with mention of a non-member is rejected'
);

-- A member mentioning another member is allowed.
SELECT lives_ok(
  $$INSERT INTO public.messages (channel_id, sender_id, type, content, mention_user_ids)
    VALUES ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000503', 'regular', 'hi [@GM](user:00000000-0000-0000-0000-000000000502)',
            ARRAY['00000000-0000-0000-0000-000000000502']::uuid[])$$,
  'insert with mention of a channel member is allowed'
);

-- A null mention list is fine (no mention).
SELECT lives_ok(
  $$INSERT INTO public.messages (channel_id, sender_id, type, content)
    VALUES ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000503', 'regular', 'no mentions')$$,
  'insert with no mention list is allowed'
);

-- The server-side send_message command still resolves mentions correctly.
SELECT lives_ok(
  $$SELECT public.send_message(
    '00000000-0000-0000-0000-000000000510',
    'roll initiative [@GM](user:00000000-0000-0000-0000-000000000502)'
  )$$,
  'send_message command works with a valid mention'
);

-- ==========================================
-- 2. Admin-message retry routing
-- ==========================================
-- With no push config the retry helper short-circuits to 0 (exercises the
-- function's SQL path); the admin_message branch is covered by code review and
-- migrate-check apply.
SELECT lives_ok(
  $$SELECT public.retry_failed_push_invocations()$$,
  'retry_failed_push_invocations runs without config'
);
SELECT is(
  (SELECT public.retry_failed_push_invocations()),
  0,
  'retry_failed_push_invocations returns 0 when unconfigured'
);

-- ==========================================
-- 3. Admin RLS: outsiders cannot see GMs-only threads
-- ==========================================
INSERT INTO public.admin_threads (id, type, subject, created_by)
VALUES ('00000000-0000-0000-0000-000000000530', 'announcement', 'Maintenance', '00000000-0000-0000-0000-000000000501');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000504","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM public.admin_threads WHERE id = '00000000-0000-0000-0000-000000000530'),
  0,
  'outsider cannot see an admin announcement'
);

SELECT * FROM finish();
ROLLBACK;
