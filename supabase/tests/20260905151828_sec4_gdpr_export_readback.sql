-- Issue #402 / SEC-4: GDPR right-of-access read-back. The reporter's own
-- abuse_reports rows (reason text is personal data) were SELECT-restricted to
-- admins only, so the reporter could never obtain them. Adds a reporter
-- read-back policy; admin visibility is unchanged (permissive policies OR).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reporter404@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other405@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin406@test.com', '', now(), '{}', '{}', now(), now());

-- handle_new_user creates these profile rows.
UPDATE profiles SET server_admin = true
WHERE id = '00000000-0000-0000-0000-000000000406';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000412', 'Readback', '00000000-0000-0000-0000-000000000404', 'abcdef15');

INSERT INTO abuse_reports (id, reporter_id, reported_user_id, channel_id, reason, status)
VALUES ('00000000-0000-0000-0000-000000000431', '00000000-0000-0000-0000-000000000404',
        '00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000412',
        'inappropriate content', 'pending');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- Grants from other test files roll back with their transactions.
GRANT SELECT ON public.abuse_reports TO authenticated;

-- Reporter reads back their own report.
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000404');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM abuse_reports
   WHERE id = '00000000-0000-0000-0000-000000000431'),
  1::bigint,
  'reporter can read back their own report'
);
RESET ROLE;

-- A non-reporter authenticated user cannot see it.
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000405');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM abuse_reports
   WHERE id = '00000000-0000-0000-0000-000000000431'),
  0::bigint,
  'non-reporter cannot read the report'
);
RESET ROLE;

-- A server admin still sees it.
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000406');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM abuse_reports
   WHERE id = '00000000-0000-0000-0000-000000000431'),
  1::bigint,
  'server admin keeps visibility of the report'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
