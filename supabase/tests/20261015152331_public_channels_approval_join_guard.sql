-- #674 approval-path hardening: join_channel cannot turn a secret into
-- membership on a listed channel, and decide_join_request honours the same
-- per-user channel cap join_channel enforces.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

-- ==========================================
-- Fixtures (owner: bypasses RLS)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000067c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm675@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'secret675@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067c04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'capped675@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067c05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'room675@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067c06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member675@test.com', '', now(), '{}', '{}', now(), now());

-- c01/c02/c04 listed (approval), c03/c05 private (invite).
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints)
VALUES
  ('00000000-0000-0000-0000-000000067d01', 'Listed By Code', '00000000-0000-0000-0000-000000067c01', 'f0675011', 'approval', 'A weekly campaign.', 'Be kind.'),
  ('00000000-0000-0000-0000-000000067d02', 'Listed By Password', '00000000-0000-0000-0000-000000067c01', 'f0675012', 'approval', 'A weekly campaign.', 'Be kind.'),
  ('00000000-0000-0000-0000-000000067d04', 'Capped Listing', '00000000-0000-0000-0000-000000067c01', 'f0675014', 'approval', 'A weekly campaign.', 'Be kind.');

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000067d03', 'Private By Invite', '00000000-0000-0000-0000-000000067c01', 'f0675013'),
  ('00000000-0000-0000-0000-000000067d05', 'Another Private', '00000000-0000-0000-0000-000000067c01', 'f0675015');

INSERT INTO channel_secrets (channel_id, password_hash)
VALUES ('00000000-0000-0000-0000-000000067d02', 'hashed-secret');

-- The cap is 1 so "one existing membership" is exactly at the limit.
UPDATE app_settings SET value = '1' WHERE key = 'max_channels_per_user';

-- c04 is a member (at the cap) and has an open request on the same channel.
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000067d04', '00000000-0000-0000-0000-000000067c06', 'Existing');

INSERT INTO channel_join_requests (channel_id, user_id, character_name, status)
VALUES ('00000000-0000-0000-0000-000000067d04', '00000000-0000-0000-0000-000000067c06', 'Existing', 'pending');

-- c05 holds the capped applicant's single membership.
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000067d05', '00000000-0000-0000-0000-000000067c04', 'Capped');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ==========================================
-- 1. A listed channel cannot be joined by invite code or password
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067c02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067c02","role":"authenticated"}', true);

SELECT is(
  (join_channel(
    p_channel_id => '00000000-0000-0000-0000-000000067d01',
    p_character_name => 'Aria',
    p_invite_code => 'f0675011'))->>'success',
  'false',
  'The correct invite code does not join a listed channel'
);

SELECT is(
  (join_channel(
    p_channel_id => '00000000-0000-0000-0000-000000067d01',
    p_character_name => 'Aria',
    p_invite_code => 'f0675011'))->>'error',
  'This game only accepts applications. Apply from the Discover tab.',
  'The rejection points the caller at the application flow'
);

SELECT is(
  (join_channel(
    p_channel_id => '00000000-0000-0000-0000-000000067d02',
    p_character_name => 'Aria',
    p_password_hash => 'hashed-secret'))->>'success',
  'false',
  'The correct password does not join a listed channel'
);

-- The guard runs before the secret comparison, so a guess and a hit are
-- indistinguishable: no invite-code/password oracle on a public listing.
SELECT is(
  (join_channel(
    p_channel_id => '00000000-0000-0000-0000-000000067d01',
    p_character_name => 'Aria',
    p_invite_code => 'wrong-code'))->>'error',
  'This game only accepts applications. Apply from the Discover tab.',
  'A wrong code on a listed channel is not distinguishable from a hit'
);

SELECT is(
  (SELECT count(*) FROM channel_members
    WHERE user_id = '00000000-0000-0000-0000-000000067c02'
      AND channel_id IN ('00000000-0000-0000-0000-000000067d01', '00000000-0000-0000-0000-000000067d02')),
  0::bigint,
  'No membership is created on a listed channel'
);

-- ==========================================
-- 2. The private invite path is unchanged
-- ==========================================

SELECT is(
  (join_channel(
    p_channel_id => '00000000-0000-0000-0000-000000067d03',
    p_character_name => 'Aria',
    p_invite_code => 'f0675013'))->>'success',
  'true',
  'The correct invite code still joins a private channel'
);

SELECT is(
  (SELECT count(*) FROM channel_members
    WHERE user_id = '00000000-0000-0000-0000-000000067c02'
      AND channel_id = '00000000-0000-0000-0000-000000067d03'),
  1::bigint,
  'The private join creates the membership'
);

SELECT is(
  (join_channel(
    p_channel_id => '00000000-0000-0000-0000-000000067d03',
    p_character_name => 'Aria',
    p_invite_code => 'wrong-code'))->>'error',
  'Invalid password or invite code',
  'A wrong code on a private channel still reports the credential failure'
);

-- ==========================================
-- 3. Approval honours the per-user channel cap
-- ==========================================

-- c04 already belongs to one channel, which is the whole cap (1). Applying is
-- allowed: the cap is enforced where membership is created, not at apply time.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067c04', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067c04","role":"authenticated"}', true);

SELECT ok(
  request_to_join_channel('00000000-0000-0000-0000-000000067d04', 'Capped', 'let me in') IS NOT NULL,
  'An applicant at the channel cap can still apply'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067c01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067c01","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
          AND user_id = '00000000-0000-0000-0000-000000067c04'
          AND status = 'pending'), true)$$,
  'The applicant has reached their channel limit.',
  'The GM cannot approve an applicant past the channel cap'
);

SELECT is(
  (SELECT status::text FROM channel_join_requests
    WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
      AND user_id = '00000000-0000-0000-0000-000000067c04'),
  'pending',
  'The blocked approval leaves the application open'
);

SELECT is(
  (SELECT count(*) FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
      AND user_id = '00000000-0000-0000-0000-000000067c04'),
  0::bigint,
  'The blocked approval adds no member'
);

-- Same channel, same GM, an applicant with room: the block above was the cap.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067c05', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067c05","role":"authenticated"}', true);

SELECT ok(
  request_to_join_channel('00000000-0000-0000-0000-000000067d04', 'Borin', 'hello') IS NOT NULL,
  'An applicant under the cap can apply'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067c01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067c01","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
          AND user_id = '00000000-0000-0000-0000-000000067c05'
          AND status = 'pending'), true)$$,
  'An approval succeeds for an applicant under the cap'
);

SELECT is(
  (SELECT count(*) FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
      AND user_id = '00000000-0000-0000-0000-000000067c05'),
  1::bigint,
  'The approval adds the applicant as a member'
);

-- Already a member of the same channel (at the cap): the insert is a no-op, so
-- the cap must not block the decision.
SELECT lives_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
          AND user_id = '00000000-0000-0000-0000-000000067c06'
          AND status = 'pending'), true)$$,
  'An applicant who is already a member is approved even at the cap'
);

SELECT is(
  (SELECT count(*) FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-000000067d04'
      AND user_id = '00000000-0000-0000-0000-000000067c06'),
  1::bigint,
  'The no-op approval adds no duplicate membership'
);

SELECT * FROM finish();
ROLLBACK;
