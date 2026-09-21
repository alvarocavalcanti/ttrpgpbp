-- 20260921190433: escape_markdown() + hardened abuse-report trigger (#562 P1).
--
-- System-alert bodies render as Markdown, so user-controlled labels must be
-- neutralized before interpolation. Verifies the escaper unit behavior and
-- that a hostile display name / reason arrives escaped (and link-free) in
-- the posted alert.
--
-- Run by `supabase test db` in CI.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

SELECT is(
  public.escape_markdown(NULL),
  '',
  'NULL escapes to empty'
);
SELECT is(
  public.escape_markdown('Plain Name 42'),
  'Plain Name 42',
  'plain text passes through unchanged'
);
SELECT is(
  public.escape_markdown('[Evil](https://evil.example)'),
  $q$\[Evil\]\(https://evil.example\)$q$,
  'a crafted link is neutralized'
);
SELECT is(
  public.escape_markdown('**bold** ![p](https://evil.example/x)'),
  $q$\*\*bold\*\* \!\[p\]\(https://evil.example/x\)$q$,
  'emphasis and images are neutralized'
);
SELECT is(
  public.escape_markdown('# header' || chr(10) || '> quote'),
  $q$\# header
\> quote$q$,
  'header and quote markers are neutralized'
);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000581', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reporter581@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000582', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reported582@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000583', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin583@test.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET display_name = '[Evil](https://evil.example)', server_admin = false
WHERE id = '00000000-0000-0000-0000-000000000581';
UPDATE profiles SET display_name = 'Reported'
WHERE id = '00000000-0000-0000-0000-000000000582';
UPDATE profiles SET display_name = 'Admin', server_admin = true
WHERE id = '00000000-0000-0000-0000-000000000583';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000584', 'Channel584', '00000000-0000-0000-0000-000000000581', 'abcdef58');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000581');
SET LOCAL ROLE authenticated;
INSERT INTO public.abuse_reports (reporter_id, reported_user_id, channel_id, message_id, reason)
VALUES ('00000000-0000-0000-0000-000000000581', '00000000-0000-0000-0000-000000000582',
  '00000000-0000-0000-0000-000000000584', NULL, 'see ![p](https://evil.example/x)');
RESET ROLE;

SELECT ok(
  (SELECT content FROM public.admin_messages WHERE is_system ORDER BY created_at DESC LIMIT 1)
    LIKE '%\\[Evil\\]\\(https://evil.example\\)%',
  'a hostile display name arrives escaped in the alert'
);
SELECT ok(
  (SELECT content FROM public.admin_messages WHERE is_system ORDER BY created_at DESC LIMIT 1)
    NOT LIKE '%](https://evil.example%',
  'the alert carries no live link to the hostile host'
);

SELECT * FROM finish();
ROLLBACK;
