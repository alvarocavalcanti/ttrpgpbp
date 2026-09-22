-- 20260921172949: profiles.terms_accepted_at + terms_version + confirm_terms().
--
-- The acceptance record is evidence, so it must be self-only (never another
-- user's row), unreachable by anon/PUBLIC, re-stampable on a version bump,
-- and not writable by a browser role through the ordinary profiles UPDATE
-- policy. Mirrors 20260917162133_age_verified_at.sql.
--
-- Run by `supabase test db` in CI.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(18);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'terms701@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'terms702@example.com', '', now(), '{}', '{}', now(), now());

-- Grant hygiene: authenticated may execute; anon and PUBLIC may not.
SELECT is(has_function_privilege('authenticated', 'public.confirm_terms(TEXT)', 'EXECUTE'), true, 'authenticated can execute confirm_terms');
SELECT is(has_function_privilege('anon', 'public.confirm_terms(TEXT)', 'EXECUTE'), false, 'anon cannot execute confirm_terms');
SELECT is(has_function_privilege('public', 'public.confirm_terms(TEXT)', 'EXECUTE'), false, 'PUBLIC cannot execute confirm_terms');

-- The guard is trigger-wired only; no API role needs direct EXECUTE.
SELECT is(has_function_privilege('anon', 'public.handle_terms_acceptance_change()', 'EXECUTE'), false, 'anon cannot execute the trigger helper');
SELECT is(has_function_privilege('authenticated', 'public.handle_terms_acceptance_change()', 'EXECUTE'), false, 'authenticated cannot execute the trigger helper');
SELECT is(has_function_privilege('service_role', 'public.handle_terms_acceptance_change()', 'EXECUTE'), false, 'service_role cannot execute the trigger helper');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);

SELECT is(
  (SELECT terms_accepted_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  NULL,
  'nothing recorded before the user accepts'
);
SELECT is(
  (SELECT terms_version FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  NULL,
  'no version recorded before the user accepts'
);

-- A browser role writing the columns directly must not move them.
UPDATE public.profiles SET terms_accepted_at = now(), terms_version = '2099-01-01' WHERE id = '00000000-0000-0000-0000-000000000701';
SELECT is(
  (SELECT terms_accepted_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  NULL,
  'a direct authenticated write cannot set the timestamp'
);
SELECT is(
  (SELECT terms_version FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  NULL,
  'a direct authenticated write cannot set the version'
);

SELECT confirm_terms('2026-09-21');
SELECT isnt(
  (SELECT terms_accepted_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  NULL,
  'confirm_terms records the timestamp'
);
SELECT is(
  (SELECT terms_version FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  '2026-09-21',
  'confirm_terms records the version'
);

SELECT is(
  (SELECT terms_accepted_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000702'),
  NULL,
  'confirm_terms only touches the caller timestamp'
);
SELECT is(
  (SELECT terms_version FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000702'),
  NULL,
  'confirm_terms only touches the caller version'
);

-- Re-acceptance on a version bump overwrites (no COALESCE): the version
-- change proves the row was re-stamped (now() is frozen inside one txn).
SELECT confirm_terms('2026-09-22');
SELECT is(
  (SELECT terms_version FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701'),
  '2026-09-22',
  're-accepting a new version overwrites the old one'
);

SELECT throws_ok(
  $$SELECT confirm_terms(NULL)$$,
  'P0001', 'Invalid terms version',
  'a NULL version is refused'
);
SELECT throws_ok(
  $$SELECT confirm_terms('  ')$$,
  'P0001', 'Invalid terms version',
  'a blank version is refused'
);
SELECT throws_ok(
  $$SELECT confirm_terms('123456789012345678901234567890123')$$,
  'P0001', 'Invalid terms version',
  'an oversized version is refused'
);

SELECT * FROM finish();
ROLLBACK;
