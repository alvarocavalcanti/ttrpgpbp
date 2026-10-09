-- #689: app_error_log + report_app_error(). Covers clamping, the
-- pathname-only route, admin-only reads, and the write path (no direct
-- INSERT/UPDATE/DELETE grant).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test689admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test689player@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000701';

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. A player can report; the route keeps only the pathname =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT report_app_error('boom', '/join/1?code=secret', '{"where":"join"}'::jsonb, 'UA', '1.2.3')$$,
  'authenticated user can report an error'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM app_error_log), 1::bigint, 'one row was written');
SELECT is((SELECT route FROM app_error_log), '/join/1', 'query string stripped from route');

-- ===== 2. Message is clamped to 500 chars =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT report_app_error(repeat('x', 600));
RESET ROLE;
SELECT is(
  (SELECT length(message) FROM app_error_log WHERE message = repeat('x', 500)),
  500,
  'message clamped to 500 chars'
);

-- ===== 3. Oversized detail is replaced with a truncation marker =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT report_app_error('big', NULL, jsonb_build_object('pad', repeat('x', 2500)));
RESET ROLE;
SELECT is(
  (SELECT detail FROM app_error_log WHERE message = 'big'),
  '{"truncated": true}'::jsonb,
  'oversized detail truncated'
);

-- ===== 4. RLS: non-admin sees nothing; server admin sees rows =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app_error_log), 0::bigint, 'non-admin cannot read the error log');
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000701');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) > 0 FROM app_error_log), true, 'server admin can read the error log');
RESET ROLE;

-- ===== 5. No direct write grant =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO app_error_log (message) VALUES ('direct')$$,
  '42501',
  NULL,
  'authenticated cannot insert into the log directly'
);
RESET ROLE;

-- ===== 6. Unauthenticated caller is rejected =====
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT throws_ok(
  $$SELECT report_app_error('anon')$$,
  'Not authenticated'
);

SELECT * FROM finish();
ROLLBACK;
