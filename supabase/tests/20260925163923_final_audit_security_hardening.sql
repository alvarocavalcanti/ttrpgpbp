-- 2026-09-25 final audit security P2s: abuse-report de-duplication
-- (20260925163924) and the anon SELECT revoke on profiles (20260925163923).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

-- anon can no longer enumerate profiles; authenticated still can.
SELECT is(
  has_table_privilege('anon', 'public.profiles', 'SELECT'),
  false,
  'anon has no SELECT on profiles'
);
SELECT is(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  true,
  'authenticated still has SELECT on profiles'
);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000009281', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hop252reporter@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000009282', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hop252target@example.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000009290', 'Report Channel', '00000000-0000-0000-0000-000000009281');
INSERT INTO channel_members (channel_id, user_id, character_name) VALUES ('00000000-0000-0000-0000-000000009290', '00000000-0000-0000-0000-000000009281', 'Reporter');
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000009295', '00000000-0000-0000-0000-000000009290', '00000000-0000-0000-0000-000000009282', 'regular', 'reported message');

-- The integrity trigger reads auth.uid() to check reporter membership.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009281', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009281","role":"authenticated"}', true);

-- First report is accepted; a duplicate for the same message is rejected.
SELECT lives_ok(
  $$INSERT INTO abuse_reports (reporter_id, reported_user_id, channel_id, message_id, reason)
    VALUES ('00000000-0000-0000-0000-000000009281', '00000000-0000-0000-0000-000000009282', '00000000-0000-0000-0000-000000009290', '00000000-0000-0000-0000-000000009295', 'spam')$$,
  'first report for a message is accepted'
);
SELECT throws_ok(
  $$INSERT INTO abuse_reports (reporter_id, reported_user_id, channel_id, message_id, reason)
    VALUES ('00000000-0000-0000-0000-000000009281', '00000000-0000-0000-0000-000000009282', '00000000-0000-0000-0000-000000009290', '00000000-0000-0000-0000-000000009295', 'spam again')$$,
  '23505',
  NULL,
  'duplicate (reporter, message) report is rejected'
);

SELECT * FROM finish();
ROLLBACK;
