-- 2026-09-25 final audit security P1: announcement threads are admin-authored
-- broadcasts. A non-admin must not be able to insert into an announcement
-- thread (which would fan their content out to every user as an announcement
-- push). Reads are unchanged. See
-- supabase/migrations/20260925163921_announcement_insert_admin_only.sql.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000009251', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ann251admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000009252', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ann251player@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000009253', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ann251gm@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000009251';

-- GM-ness for 9253.
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000009260', 'GM Channel', '00000000-0000-0000-0000-000000009253');

INSERT INTO admin_threads (id, type, subject, created_by, audience)
VALUES
  ('00000000-0000-0000-0000-000000009271', 'announcement', 'To everyone', '00000000-0000-0000-0000-000000009251', 'all_users'),
  ('00000000-0000-0000-0000-000000009272', 'announcement', 'To GMs', '00000000-0000-0000-0000-000000009251', 'gms');

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- Regular player cannot post into an all_users announcement.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000009252');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000009271', '00000000-0000-0000-0000-000000009252', 'hijack')$$,
  'new row violates row-level security policy for table "admin_messages"',
  'regular player cannot post into an all_users announcement'
);
-- ...but still reads it.
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE id = '00000000-0000-0000-0000-000000009271'),
  1::bigint,
  'regular player still reads the all_users announcement'
);
RESET ROLE;

-- Active GM cannot post into a gms announcement either.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000009253');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000009272', '00000000-0000-0000-0000-000000009253', 'gm hijack')$$,
  'new row violates row-level security policy for table "admin_messages"',
  'GM cannot post into a gms announcement'
);
RESET ROLE;

-- Admin can post into both announcements.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000009251');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000009271', '00000000-0000-0000-0000-000000009251', 'hello all')$$,
  'admin can post an all_users announcement'
);
SELECT lives_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000009272', '00000000-0000-0000-0000-000000009251', 'hello gms')$$,
  'admin can post a gms announcement'
);
RESET ROLE;

-- DM participation is unchanged: a player can post in their own support DM.
INSERT INTO admin_threads (id, type, gm_id, created_by)
VALUES ('00000000-0000-0000-0000-000000009273', 'dm', '00000000-0000-0000-0000-000000009252', '00000000-0000-0000-0000-000000009252');

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000009252');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000009273', '00000000-0000-0000-0000-000000009252', 'help please')$$,
  'player still posts in their own support DM'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
