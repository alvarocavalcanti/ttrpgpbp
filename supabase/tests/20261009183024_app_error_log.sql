-- #689: app_error_log + report_app_error(). Covers priming/route stripping,
-- clamping, message redaction, the detail allowlist, admin-only reads, and the
-- write path (no direct INSERT/UPDATE/DELETE grant).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test689admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test689player@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test689spammer@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000701';

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. A player can report; route keeps only the pathname =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT report_app_error('boom', '/join/1?code=secret', '{"where":"join"}'::jsonb, 'UA', '1.2.3')$$,
  'authenticated user can report an error'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM app_error_log), 1::bigint, 'one row was written');
SELECT is((SELECT route FROM app_error_log), '/join/1', 'query string stripped from route');
SELECT is(
  (SELECT detail FROM app_error_log WHERE message = 'boom'),
  NULL,
  'non-allowlisted detail keys are dropped'
);

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

-- ===== 3. Stack is kept but truncated to 800 chars =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT report_app_error('stacked', NULL, jsonb_build_object('stack', repeat('x', 2000)));
RESET ROLE;
SELECT is(
  length((SELECT detail->>'stack' FROM app_error_log WHERE message = 'stacked')),
  800,
  'stack truncated to 800 chars'
);

-- ===== 4. Value dumps in the message are redacted =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT report_app_error('duplicate key value violates unique constraint "profiles_email_key"' ||
  ' Key (email)=(secret@example.com) already exists.');
RESET ROLE;
SELECT is(
  (SELECT message NOT LIKE '%secret@example.com%' AND message LIKE '%Key [redacted]%'
   FROM app_error_log WHERE message LIKE 'duplicate key%'),
  true,
  'key values redacted from stored message'
);

-- ===== 5. RLS: non-admin sees nothing; server admin sees rows =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app_error_log), 0::bigint, 'non-admin cannot read the error log');
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000701');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) > 0 FROM app_error_log), true, 'server admin can read the error log');
RESET ROLE;

-- ===== 6. No direct write grant =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000702');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO app_error_log (message) VALUES ('direct')$$,
  '42501',
  NULL,
  'authenticated cannot insert into the log directly'
);
RESET ROLE;

-- ===== 7. Per-user burst cap (20/minute) =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000703');
SET LOCAL ROLE authenticated;
SELECT report_app_error('spam') FROM generate_series(1, 25);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM app_error_log WHERE user_id = '00000000-0000-0000-0000-000000000703'),
  20::bigint,
  'per-user burst cap holds at 20/minute'
);

-- ===== 8. Unauthenticated caller is rejected =====
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT throws_ok(
  $$SELECT report_app_error('anon')$$,
  'Not authenticated'
);

SELECT * FROM finish();
ROLLBACK;
