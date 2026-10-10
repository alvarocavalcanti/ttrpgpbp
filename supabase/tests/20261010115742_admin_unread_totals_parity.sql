-- get_admin_unread_totals parity with get_admin_unread_count: the batch totals
-- must credit the server admin for DMs and the system thread, not just
-- announcements (the pre-fix function silently dropped both).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'totals-admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'totals-gm@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-00000000e001';

INSERT INTO admin_threads (id, type, subject, gm_id, created_by, audience)
VALUES
  ('00000000-0000-0000-0000-00000000d001', 'dm', NULL, '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e002', NULL),
  ('00000000-0000-0000-0000-00000000d002', 'system', 'System', NULL, '00000000-0000-0000-0000-00000000e001', NULL),
  ('00000000-0000-0000-0000-00000000d003', 'announcement', 'Welcome', NULL, '00000000-0000-0000-0000-00000000e001', 'all_users');

-- No admin_thread_reads rows, so every matching thread counts as unread.

SELECT is(
  (SELECT unread_count FROM get_admin_unread_totals(ARRAY['00000000-0000-0000-0000-00000000e001'::uuid])
     WHERE user_id = '00000000-0000-0000-0000-00000000e001'),
  3::bigint,
  'admin totals include the dm, the system thread, and the announcement'
);

SELECT is(
  (SELECT unread_count FROM get_admin_unread_totals(ARRAY['00000000-0000-0000-0000-00000000e002'::uuid])
     WHERE user_id = '00000000-0000-0000-0000-00000000e002'),
  2::bigint,
  'gm totals include the dm and the announcement but not the system thread'
);

SELECT is(
  (SELECT count(*) FROM get_admin_unread_totals(ARRAY['00000000-0000-0000-0000-00000000e001'::uuid, '00000000-0000-0000-0000-00000000e002'::uuid])),
  2::bigint,
  'batch returns one row per user with unread'
);

-- A read marker clears a thread for that user only.
INSERT INTO admin_thread_reads (thread_id, user_id, last_read_at)
VALUES ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000e001', now() + interval '1 minute');

SELECT is(
  (SELECT unread_count FROM get_admin_unread_totals(ARRAY['00000000-0000-0000-0000-00000000e001'::uuid])
     WHERE user_id = '00000000-0000-0000-0000-00000000e001'),
  2::bigint,
  'a newer read marker drops the read announcement from the total'
);

SELECT * FROM finish();
ROLLBACK;
