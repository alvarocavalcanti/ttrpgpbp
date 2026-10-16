-- #722: the applicant learns the outcome in the app, and can dismiss it.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000072231', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ackgm722@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000072232', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ackapp722@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000072233', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ackother722@test.com', '', now(), '{}', '{}', now(), now());

-- Two listed channels: the second is delisted and archived after the decision,
-- to prove the applicant still learns the outcome.
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints)
VALUES
  ('00000000-0000-0000-0000-000000072241', 'Listed Game', '00000000-0000-0000-0000-000000072231', 'a7223001', 'approval', 'A weekly campaign.', 'Be kind.'),
  ('00000000-0000-0000-0000-000000072242', 'Gone Game', '00000000-0000-0000-0000-000000072231', 'a7223002', 'approval', 'Soon private.', 'Be kind.');

INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000072241', '00000000-0000-0000-0000-000000072231', 'GM');

INSERT INTO channel_join_requests (id, channel_id, user_id, character_name, status, decided_at)
VALUES
  ('00000000-0000-0000-0000-000000072251', '00000000-0000-0000-0000-000000072241', '00000000-0000-0000-0000-000000072232', 'Aria', 'rejected', now()),
  ('00000000-0000-0000-0000-000000072252', '00000000-0000-0000-0000-000000072242', '00000000-0000-0000-0000-000000072232', 'Aria', 'approved', now()),
  ('00000000-0000-0000-0000-000000072253', '00000000-0000-0000-0000-000000072241', '00000000-0000-0000-0000-000000072232', 'Aria', 'pending', NULL),
  ('00000000-0000-0000-0000-000000072254', '00000000-0000-0000-0000-000000072241', '00000000-0000-0000-0000-000000072233', 'Borin', 'rejected', now());

-- The GM delists and archives the approved channel: the applicant is not a
-- member, and the channels table is not readable to them.
UPDATE channels SET join_mode = 'invite', is_archived = true WHERE id = '00000000-0000-0000-0000-000000072242';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000072232', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000072232","role":"authenticated"}', true);

-- ==========================================
-- 1. The applicant sees their own decisions
-- ==========================================

SELECT is(
  (SELECT count(*) FROM get_my_join_request_decisions()),
  2::bigint,
  'both decided applications are returned'
);

SELECT is(
  (SELECT status FROM get_my_join_request_decisions()
     WHERE id = '00000000-0000-0000-0000-000000072251'),
  'rejected'::public.join_request_status,
  'the rejection is reported'
);

-- Rejected, not a member, channel unlisted: the name still comes back.
SELECT is(
  (SELECT channel_name FROM get_my_join_request_decisions()
     WHERE id = '00000000-0000-0000-0000-000000072252'),
  'Gone Game',
  'a decision is returned with the channel name even after a delist'
);

SELECT is(
  (SELECT count(*) FROM get_my_join_request_decisions()
     WHERE id = '00000000-0000-0000-0000-000000072253'),
  0::bigint,
  'a pending application is not a decision'
);

SELECT is(
  (SELECT count(*) FROM get_my_join_request_decisions()
     WHERE id = '00000000-0000-0000-0000-000000072254'),
  0::bigint,
  'another player''s decision is not returned'
);

-- ==========================================
-- 2. Acknowledgement
-- ==========================================

SELECT lives_ok(
  $$SELECT acknowledge_join_request_decision('00000000-0000-0000-0000-000000072251')$$,
  'the applicant can acknowledge their decision'
);
SELECT is(
  (SELECT applicant_acknowledged_at IS NOT NULL FROM channel_join_requests
     WHERE id = '00000000-0000-0000-0000-000000072251'),
  true,
  'the acknowledgement is stamped'
);
SELECT is(
  (SELECT count(*) FROM get_my_join_request_decisions()
     WHERE id = '00000000-0000-0000-0000-000000072251'),
  0::bigint,
  'an acknowledged decision leaves the notice'
);

SELECT throws_ok(
  $$SELECT acknowledge_join_request_decision('00000000-0000-0000-0000-000000072254')$$,
  'P0001', 'Application not found.',
  'another player''s decision cannot be acknowledged'
);

SELECT throws_ok(
  $$SELECT acknowledge_join_request_decision('00000000-0000-0000-0000-000000072253')$$,
  'P0001', 'Application not found.',
  'a pending application cannot be acknowledged'
);

SELECT * FROM finish();
ROLLBACK;
