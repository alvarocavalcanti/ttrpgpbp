-- #461: admin abuse-reports viewer RPCs. Verifies the admin-only guard on both
-- functions, the joined list payload, and the status transition + audit trail.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000461', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reporter461@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000462', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reported462@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000463', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin463@test.com', '', now(), '{}', '{}', now(), now());

-- handle_new_user creates these profile rows.
UPDATE profiles SET display_name = 'Reporter', server_admin = false
WHERE id = '00000000-0000-0000-0000-000000000461';
UPDATE profiles SET display_name = 'Reported'
WHERE id = '00000000-0000-0000-0000-000000000462';
UPDATE profiles SET display_name = 'Admin', server_admin = true
WHERE id = '00000000-0000-0000-0000-000000000463';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000464', 'Reported Channel', '00000000-0000-0000-0000-000000000461', 'abcdef46');

INSERT INTO abuse_reports (id, reporter_id, reported_user_id, channel_id, reason, status)
VALUES
  ('00000000-0000-0000-0000-000000000465', '00000000-0000-0000-0000-000000000461',
   '00000000-0000-0000-0000-000000000462', '00000000-0000-0000-0000-000000000464',
   'inappropriate content', 'pending'),
  ('00000000-0000-0000-0000-000000000466', '00000000-0000-0000-0000-000000000461',
   '00000000-0000-0000-0000-000000000462', '00000000-0000-0000-0000-000000000464',
   'spam', 'pending');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Non-admin cannot read or resolve =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000461');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM admin_list_abuse_reports()$$,
  'P0001', 'Not authorized',
  'non-admin cannot list abuse reports'
);
SELECT throws_ok(
  $$SELECT admin_resolve_abuse_report('00000000-0000-0000-0000-000000000465', 'resolved')$$,
  'P0001', 'Not authorized',
  'non-admin cannot resolve a report'
);
RESET ROLE;

-- ===== 2. Admin list joins reporter/reported/channel =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000463');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_list_abuse_reports()),
  2::bigint,
  'admin sees every report'
);
SELECT is(
  (SELECT reporter_display_name FROM admin_list_abuse_reports()
    WHERE id = '00000000-0000-0000-0000-000000000465'),
  'Reporter',
  'list carries the reporter display name'
);
SELECT is(
  (SELECT reported_display_name || '|' || channel_name FROM admin_list_abuse_reports()
    WHERE id = '00000000-0000-0000-0000-000000000465'),
  'Reported|Reported Channel',
  'list carries the reported user and channel names'
);

-- ===== 3. Resolve validation =====
SELECT throws_ok(
  $$SELECT admin_resolve_abuse_report('00000000-0000-0000-0000-000000000465', 'bogus')$$,
  'P0001', 'Invalid report status: bogus',
  'rejects a status outside resolved/dismissed'
);
SELECT throws_ok(
  $$SELECT admin_resolve_abuse_report('00000000-0000-0000-0000-000000000499', 'resolved')$$,
  'P0001', 'Report not found',
  'rejects an unknown report id'
);

-- ===== 4. Happy path writes status + audit =====
SELECT lives_ok(
  $$SELECT admin_resolve_abuse_report('00000000-0000-0000-0000-000000000465', 'resolved')$$,
  'admin resolves an open report'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM abuse_reports WHERE id = '00000000-0000-0000-0000-000000000465'),
  'resolved',
  'report status is resolved'
);
SELECT is(
  (SELECT count(*) FROM audit_logs
    WHERE action = 'resolve_abuse_report'
      AND target_id = '00000000-0000-0000-0000-000000000465'
      AND details->>'status' = 'resolved'),
  1::bigint,
  'resolution is recorded in the audit log'
);

SELECT * FROM finish();
ROLLBACK;
