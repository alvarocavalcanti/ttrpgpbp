-- Issue #441: blocked (and suspended) members kept accruing unread counts for
-- messages they can never see. The messages SELECT policy hides everything
-- from them, but both unread functions scanned every channel_members row.
-- Both scans must now skip is_blocked members and suspended users, so the
-- lobby pill and launcher badge can no longer show a permanent unread.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue441-gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue441-blocked@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue441-active@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue441-suspended@example.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000410', 'Issue 441', '00000000-0000-0000-0000-000000000400', '441abf12');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'Blocked', now() - interval '1 hour', true),
  ('00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000402', 'Active', now() - interval '1 hour', false),
  ('00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000403', 'Suspended', now() - interval '1 hour', false);

UPDATE profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000000403';

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000414', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000400', 'regular', 'gm announces something');

SELECT plan(5);

-- pgTAP test runner needs explicit grants that Supabase usually provides by default
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Blocked member: the RPC must not return a row for their membership at all
-- (the member scan skips them), so the lobby pill stays clear.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);

SELECT is(
  (SELECT COUNT(*) FROM public.get_user_channels_unread('00000000-0000-0000-0000-000000000401')),
  0::BIGINT,
  'blocked member has no unread row'
);

-- Sanity check: the same membership, unblocked, counts the message. Proves
-- the empty result above comes from the filter, not the fixture.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);

SELECT is(
  (SELECT COALESCE(SUM(unread_count), 0)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-000000000402')),
  1::BIGINT,
  'active member still counts the unread message'
);

-- Batch totals (push pipeline, service_role caller): blocked and suspended
-- users get no row; the active member counts 1.
SET LOCAL ROLE service_role;

SELECT set_eq(
  $$SELECT user_id::text FROM public.get_unread_totals(
    ARRAY[
      '00000000-0000-0000-0000-000000000401'::UUID,
      '00000000-0000-0000-0000-000000000402'::UUID,
      '00000000-0000-0000-0000-000000000403'::UUID
    ]
  )$$,
  ARRAY['00000000-0000-0000-0000-000000000402'],
  'batch totals list neither blocked nor suspended members'
);

SELECT is(
  (SELECT unread_count FROM public.get_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000402'::UUID]
  )),
  1::BIGINT,
  'active member batch total counts the unread message'
);

-- Symmetry guard: suspension alone (not blocked) is also excluded.
SELECT set_config('request.jwt.claim.sub', NULL, true);

SELECT is(
  (SELECT COUNT(*) FROM public.get_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000403'::UUID]
  )),
  0::BIGINT,
  'suspended member has no unread row'
);

SELECT * FROM finish();
ROLLBACK;
