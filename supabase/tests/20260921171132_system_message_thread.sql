-- 20260921171132: system message thread for safety alerts (#562 P1).
--
-- Verifies the grant hygiene (service_role-only producer), the lazy
-- singleton thread, the is_system/sender CHECK, admin-only visibility, the
-- abuse-report trigger payload, and the read/unread coverage for the
-- system type.
--
-- Run by `supabase test db` in CI.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(29);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000571', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reporter571@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000572', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reported572@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000573', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin573@test.com', '', now(), '{}', '{}', now(), now());

-- handle_new_user creates these profile rows (auth.uid() is unset here, so
-- the server_admin immutability trigger does not fire).
UPDATE profiles SET display_name = 'Reporter562', server_admin = false
WHERE id = '00000000-0000-0000-0000-000000000571';
UPDATE profiles SET display_name = 'Reported562'
WHERE id = '00000000-0000-0000-0000-000000000572';
UPDATE profiles SET display_name = 'Admin562', server_admin = true
WHERE id = '00000000-0000-0000-0000-000000000573';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000574', 'Channel562', '00000000-0000-0000-0000-000000000571', 'abcdef56');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Grant hygiene =====
SELECT is(has_function_privilege('authenticated', 'public.post_system_message(TEXT)', 'EXECUTE'), false, 'authenticated cannot execute post_system_message');
SELECT is(has_function_privilege('anon', 'public.post_system_message(TEXT)', 'EXECUTE'), false, 'anon cannot execute post_system_message');
SELECT is(has_function_privilege('public', 'public.post_system_message(TEXT)', 'EXECUTE'), false, 'PUBLIC cannot execute post_system_message');
SELECT is(has_function_privilege('service_role', 'public.post_system_message(TEXT)', 'EXECUTE'), true, 'service_role can execute post_system_message');

SELECT is(has_function_privilege('anon', 'public.get_or_create_system_thread()', 'EXECUTE'), false, 'anon cannot execute get_or_create_system_thread');
SELECT is(has_function_privilege('authenticated', 'public.get_or_create_system_thread()', 'EXECUTE'), false, 'authenticated cannot execute get_or_create_system_thread');
SELECT is(has_function_privilege('service_role', 'public.get_or_create_system_thread()', 'EXECUTE'), false, 'service_role cannot execute get_or_create_system_thread');

SELECT is(has_function_privilege('anon', 'public.enqueue_abuse_report_alert()', 'EXECUTE'), false, 'anon cannot execute the trigger helper');
SELECT is(has_function_privilege('authenticated', 'public.enqueue_abuse_report_alert()', 'EXECUTE'), false, 'authenticated cannot execute the trigger helper');
SELECT is(has_function_privilege('service_role', 'public.enqueue_abuse_report_alert()', 'EXECUTE'), false, 'service_role cannot execute the trigger helper');

-- ===== 2. Producer validation =====
SELECT throws_ok(
  $$SELECT post_system_message('')$$,
  'P0001', 'System message content is required',
  'empty content is refused'
);
SELECT throws_ok(
  $$SELECT post_system_message(NULL)$$,
  'P0001', 'System message content is required',
  'NULL content is refused'
);

-- ===== 3. Abuse-report trigger posts exactly one thread, many messages =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000571');
SET LOCAL ROLE authenticated;
INSERT INTO public.abuse_reports (reporter_id, reported_user_id, channel_id, message_id, reason)
VALUES
  ('00000000-0000-0000-0000-000000000571', '00000000-0000-0000-0000-000000000572',
   '00000000-0000-0000-0000-000000000574', NULL, 'spam links everywhere'),
  ('00000000-0000-0000-0000-000000000571', '00000000-0000-0000-0000-000000000572',
   NULL, NULL, 'harassment in DMs');
RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.admin_threads WHERE type = 'system'),
  1::bigint,
  'two reports share a single system thread'
);
SELECT is(
  (SELECT count(*) FROM public.admin_messages WHERE is_system),
  2::bigint,
  'each report posts one system message'
);
SELECT is(
  (SELECT count(*) FROM public.admin_messages WHERE is_system AND sender_id IS NULL),
  2::bigint,
  'system messages carry no human sender'
);
SELECT ok(
  (SELECT content FROM public.admin_messages WHERE is_system ORDER BY created_at LIMIT 1)
    LIKE '%Reporter562%Reported562%Channel562%spam links everywhere%',
  'the alert names reporter, reported user, channel, and reason'
);
SELECT ok(
  (SELECT content FROM public.admin_messages WHERE is_system ORDER BY created_at LIMIT 1)
    LIKE '%/admin?user=00000000-0000-0000-0000-000000000572%/admin/channels/00000000-0000-0000-0000-000000000574%',
  'the alert links the reported user and the channel'
);

-- ===== 4. Sender/CHECK integrity =====
SELECT throws_ok(
  $$INSERT INTO public.admin_messages (thread_id, sender_id, content, is_system)
    VALUES ((SELECT id FROM public.admin_threads WHERE type = 'system' LIMIT 1),
      '00000000-0000-0000-0000-000000000573', 'forged', true)$$,
  '23514', 'new row for relation "admin_messages" violates check constraint "admin_messages_system_sender_check"',
  'a system row with a sender is refused'
);
SELECT throws_ok(
  $$INSERT INTO public.admin_messages (thread_id, sender_id, content, is_system)
    VALUES ((SELECT id FROM public.admin_threads WHERE type = 'system' LIMIT 1),
      NULL, 'senderless', false)$$,
  '23514', 'new row for relation "admin_messages" violates check constraint "admin_messages_system_sender_check"',
  'a non-system row without a sender is refused'
);

-- ===== 5. Admin-only visibility =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000571');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.admin_threads WHERE type = 'system'),
  0::bigint,
  'a non-admin cannot see the system thread'
);
SELECT is(
  (SELECT count(*) FROM public.admin_messages WHERE is_system),
  0::bigint,
  'a non-admin cannot see system messages'
);
SELECT is(
  public.get_admin_unread_count('00000000-0000-0000-0000-000000000571'),
  0,
  'the system thread does not count for a non-admin'
);
SELECT throws_ok(
  $$SELECT mark_admin_thread_read((SELECT id FROM public.admin_threads WHERE type = 'system' LIMIT 1))$$,
  'P0001', 'Thread not found.',
  'a non-admin cannot mark the system thread read'
);
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000573');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.admin_threads WHERE type = 'system'),
  1::bigint,
  'the admin can see the system thread'
);
SELECT is(
  (SELECT count(*) FROM public.admin_messages WHERE is_system),
  2::bigint,
  'the admin can see system messages'
);
SELECT lives_ok(
  $$INSERT INTO public.admin_messages (thread_id, sender_id, content)
    VALUES ((SELECT id FROM public.admin_threads WHERE type = 'system' LIMIT 1),
      '00000000-0000-0000-0000-000000000573', 'Filed with Hotline.ie.')$$,
  'the admin can reply in the system thread'
);
SELECT is(
  public.get_admin_unread_count('00000000-0000-0000-0000-000000000573'),
  1,
  'the unread system thread counts for the admin'
);
SELECT lives_ok(
  $$SELECT mark_admin_thread_read((SELECT id FROM public.admin_threads WHERE type = 'system' LIMIT 1))$$,
  'the admin can mark the system thread read'
);
SELECT is(
  public.get_admin_unread_count('00000000-0000-0000-0000-000000000573'),
  0,
  'the counter clears once the admin reads the thread'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
