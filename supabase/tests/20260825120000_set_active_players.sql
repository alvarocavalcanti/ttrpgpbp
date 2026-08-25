BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Fixed users keep this test independent of auth helper packages.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue289-gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue289-p1@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue289-p2@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue289-outsider@example.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000305', 'Issue 289', '00000000-0000-0000-0000-000000000301', 'issue289');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000302', 'Player One', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000303', 'Player Two', now() - interval '1 hour');

SELECT plan(6);

-- pgTAP test runner needs explicit grants that Supabase usually provides by default
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);

-- GM sets active players without a message.
SELECT lives_ok(
  $$SELECT public.set_active_players(
    '00000000-0000-0000-0000-000000000305',
    ARRAY['00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000303']::uuid[]
  )$$,
  'GM can set active players'
);

SELECT is(
  (SELECT count(*)::int FROM public.channel_members WHERE channel_id = '00000000-0000-0000-0000-000000000305' AND is_active_player),
  2,
  'both players become active'
);

-- Empty array clears all active players.
SELECT lives_ok(
  $$SELECT public.set_active_players(
    '00000000-0000-0000-0000-000000000305',
    ARRAY[]::uuid[]
  )$$,
  'GM can clear active players'
);

SELECT is(
  (SELECT count(*)::int FROM public.channel_members WHERE channel_id = '00000000-0000-0000-0000-000000000305' AND is_active_player),
  0,
  'empty array clears all active players'
);

-- Non-GM member is rejected.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.set_active_players(
    '00000000-0000-0000-0000-000000000305',
    ARRAY['00000000-0000-0000-0000-000000000302']::uuid[]
  )$$,
  'P0001',
  'Only the GM can change active players.',
  'non-GM member is rejected'
);

-- Non-member uid is rejected.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.set_active_players(
    '00000000-0000-0000-0000-000000000305',
    ARRAY['00000000-0000-0000-0000-000000000304']::uuid[]
  )$$,
  'P0001',
  'Active player must be a member of this channel.',
  'non-member uid is rejected'
);

SELECT * FROM finish();
ROLLBACK;
