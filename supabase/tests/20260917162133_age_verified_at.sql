-- 20260917162133: profiles.age_verified_at + confirm_age().
--
-- The attestation timestamp is evidence, so it must be self-only (never another
-- user's row), unreachable by anon/PUBLIC, idempotent, and not writable by a
-- browser role through the ordinary profiles UPDATE policy.
--
-- Run by `supabase test db` in CI.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'age601@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'age602@example.com', '', now(), '{}', '{}', now(), now());

-- Grant hygiene: authenticated may execute; anon and PUBLIC may not.
SELECT is(has_function_privilege('authenticated', 'public.confirm_age()', 'EXECUTE'), true, 'authenticated can execute confirm_age');
SELECT is(has_function_privilege('anon', 'public.confirm_age()', 'EXECUTE'), false, 'anon cannot execute confirm_age');
SELECT is(has_function_privilege('public', 'public.confirm_age()', 'EXECUTE'), false, 'PUBLIC cannot execute confirm_age');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}', true);

SELECT is(
  (SELECT age_verified_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000601'),
  NULL,
  'nothing recorded before the user confirms'
);

-- A browser role writing the column directly must not move it.
UPDATE public.profiles SET age_verified_at = now() WHERE id = '00000000-0000-0000-0000-000000000601';
SELECT is(
  (SELECT age_verified_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000601'),
  NULL,
  'a direct authenticated write cannot set the timestamp'
);

SELECT confirm_age();
SELECT isnt(
  (SELECT age_verified_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000601'),
  NULL,
  'confirm_age records the timestamp'
);

SELECT is(
  (SELECT age_verified_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000602'),
  NULL,
  'confirm_age only touches the caller row'
);

CREATE TEMP TABLE age_first_stamp AS
  SELECT age_verified_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000601';
SELECT confirm_age();
SELECT is(
  (SELECT age_verified_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000601'),
  (SELECT age_verified_at FROM age_first_stamp),
  'confirm_age does not rewrite an existing timestamp'
);

SELECT * FROM finish();
ROLLBACK;
