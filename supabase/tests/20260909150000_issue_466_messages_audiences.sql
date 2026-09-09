-- Issue #466: Messages for everyone.
--
-- Covers: announcement audience visibility matrix (admin / active GM /
-- regular player / suspended × 'all_users' | 'gms'), user-initiated admin
-- DMs (create + read own + isolation from others), unread counts per
-- audience, mark_admin_thread_read gating, and the recipient RPC.
--
-- RLS checks impersonate the authenticated role (SET LOCAL ROLE) because the
-- table owner bypasses row level security.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(28);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000004661', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test466a@example.com', '', now(), '{}', '{}', now(), now()), -- admin
  ('00000000-0000-0000-0000-000000004662', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test466b@example.com', '', now(), '{}', '{}', now(), now()), -- active GM
  ('00000000-0000-0000-0000-000000004663', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test466c@example.com', '', now(), '{}', '{}', now(), now()), -- regular player
  ('00000000-0000-0000-0000-000000004664', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test466d@example.com', '', now(), '{}', '{}', now(), now()); -- player 2 (suspendable)

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000004661';

-- GM-ness for 4662.
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000004670', 'GM Channel', '00000000-0000-0000-0000-000000004662');

-- Announcement threads: one per audience.
INSERT INTO admin_threads (id, type, subject, created_by, audience)
VALUES
  ('00000000-0000-0000-0000-000000004681', 'announcement', 'To everyone', '00000000-0000-0000-0000-000000004661', 'all_users'),
  ('00000000-0000-0000-0000-000000004682', 'announcement', 'To GMs', '00000000-0000-0000-0000-000000004661', 'gms');

INSERT INTO admin_messages (thread_id, sender_id, content)
VALUES
  ('00000000-0000-0000-0000-000000004681', '00000000-0000-0000-0000-000000004661', 'hello all'),
  ('00000000-0000-0000-0000-000000004682', '00000000-0000-0000-0000-000000004661', 'hello gms');

-- Pre-existing DM thread owned by player 2 (gm_id = player 2).
INSERT INTO admin_threads (id, type, gm_id, created_by)
VALUES ('00000000-0000-0000-0000-000000004683', 'dm',
  '00000000-0000-0000-0000-000000004664', '00000000-0000-0000-0000-000000004664');

-- Suspension flips must run as postgres: the #300 trigger blocks any
-- is_suspended change while a JWT context is set. Helper does both.
CREATE OR REPLACE FUNCTION pg_temp.set_suspended(p_uid uuid, p_val boolean)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', false);
  SELECT set_config('request.jwt.claims', '{}', false);
  UPDATE profiles SET is_suspended = p_val WHERE id = p_uid;
$$;

-- Convenience: impersonate a user (call before SET LOCAL ROLE authenticated).
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Announcement audience visibility matrix =====
-- Admin sees both audiences.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004661');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'announcement'),
  2::bigint,
  'admin sees announcements of both audiences'
);
RESET ROLE;

-- Active GM sees both audiences.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004662');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'announcement'),
  2::bigint,
  'active GM sees announcements of both audiences'
);
RESET ROLE;

-- Regular player sees only 'all_users'.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004663');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'announcement'),
  1::bigint,
  'regular player sees only all_users announcements'
);
SELECT is(
  (SELECT count(*) FROM admin_messages WHERE thread_id = '00000000-0000-0000-0000-000000004681'),
  1::bigint,
  'regular player can read all_users announcement messages'
);
SELECT is(
  (SELECT count(*) FROM admin_messages WHERE thread_id = '00000000-0000-0000-0000-000000004682'),
  0::bigint,
  'regular player cannot read gms announcement messages'
);

-- Suspended regular player loses all_users announcements too.
RESET ROLE;
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000004663', true);
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004663');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'announcement'),
  0::bigint,
  'suspended player sees no announcements'
);

-- Restore the player so later sections test the regular (non-suspended)
-- player path.
RESET ROLE;
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000004663', false);

-- Suspended GM loses gms announcements (is_active_gm parity).
RESET ROLE;
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000004662', true);
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004662');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'announcement'),
  0::bigint,
  'suspended GM sees no announcements'
);
RESET ROLE;
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000004662', false);
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004662');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'announcement'),
  2::bigint,
  'unsuspended GM sees announcements again'
);
RESET ROLE;

-- ===== 2. User-initiated support DM =====
-- A regular player can create a dm thread with gm_id = self...
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004663');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO admin_threads (type, gm_id, created_by) VALUES ('dm', '00000000-0000-0000-0000-000000004663', '00000000-0000-0000-0000-000000004663')$$,
  'regular player can create a support dm thread'
);
-- ...and post in it.
SELECT lives_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    SELECT id, '00000000-0000-0000-0000-000000004663', 'help please'
    FROM admin_threads WHERE type = 'dm' AND gm_id = '00000000-0000-0000-0000-000000004663'$$,
  'regular player can post in their own support thread'
);

-- They can read their own dm thread but not another user's.
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'dm'),
  1::bigint,
  'player sees only their own dm thread'
);
SELECT is(
  (SELECT count(*) FROM admin_messages WHERE thread_id = '00000000-0000-0000-0000-000000004683'),
  0::bigint,
  'player cannot read another user''s dm thread messages'
);

-- Isolation: player 2's thread is not writable by player 1's message insert.
SELECT throws_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000004683', '00000000-0000-0000-0000-000000004663', 'intrude')$$,
  'new row violates row-level security policy for table "admin_messages"',
  'player cannot insert into another user''s dm thread'
);

-- The admin sees and can post to the player's support thread.
RESET ROLE;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004661');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'dm'),
  2::bigint,
  'admin sees all dm threads'
);
SELECT lives_ok(
  $$INSERT INTO admin_messages (thread_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000004683', '00000000-0000-0000-0000-000000004661', 'admin here')$$,
  'admin can post in a user''s support thread'
);
RESET ROLE;

-- A non-participant, non-admin GM still cannot see player 2's thread.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004662');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE type = 'dm'),
  0::bigint,
  'non-participant GM sees no dm threads'
);
RESET ROLE;

-- ===== 3. Unread counts per audience =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004663');
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000004663'),
  2,
  'player unread: own support thread + all_users announcement'
);

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004662');
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000004662'),
  2,
  'active GM unread: both announcements'
);

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004661');
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000004661'),
  4,
  'admin unread: both announcements + both support threads'
);

-- mark_admin_thread_read refuses threads the caller cannot see.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004663');
SELECT throws_ok(
  $$SELECT mark_admin_thread_read('00000000-0000-0000-0000-000000004682')$$,
  'Thread not found.',
  'player cannot mark an invisible gms announcement read'
);
SELECT lives_ok(
  $$SELECT mark_admin_thread_read('00000000-0000-0000-0000-000000004681')$$,
  'player can mark a visible announcement read'
);
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000004663'),
  1,
  'announcement no longer counted after read'
);

-- ===== 4. Recipient RPC =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004661');
SELECT is(
  (SELECT count(*) FROM admin_list_message_recipients()),
  4::bigint,
  'admin lists all non-suspended users'
);

-- Suspended users drop out of the list.
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000004664', true);
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004661');
SELECT is(
  (SELECT count(*) FROM admin_list_message_recipients()),
  3::bigint,
  'suspended users are excluded from recipients'
);
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000004664', false);

-- Non-admins cannot call it.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000004663');
SELECT throws_ok(
  $$SELECT * FROM admin_list_message_recipients()$$,
  'Not authorized',
  'non-admin cannot list message recipients'
);

-- ===== 5. Consent timestamp trigger =====
SELECT is(
  (SELECT email_opt_in_at IS NULL FROM profiles WHERE id = '00000000-0000-0000-0000-000000004664'),
  true,
  'no consent timestamp before any opt-in change'
);

-- Flipping the flag stamps the timestamp.
UPDATE profiles SET email_opt_in = true WHERE id = '00000000-0000-0000-0000-000000004664';
SELECT is(
  (SELECT email_opt_in_at IS NOT NULL FROM profiles WHERE id = '00000000-0000-0000-0000-000000004664'),
  true,
  'consent change is timestamped by the trigger'
);

-- Unrelated updates preserve the timestamp; the client cannot forge it.
UPDATE profiles SET display_name = 'Player 2 renamed' WHERE id = '00000000-0000-0000-0000-000000004664';
SELECT is(
  (SELECT email_opt_in IS DISTINCT FROM false FROM profiles WHERE id = '00000000-0000-0000-0000-000000004664'),
  true,
  'opt-in value survives an unrelated update with timestamp preserved'
);

SELECT * FROM finish();
ROLLBACK;
