-- #674 Phase A: public-facing channels — schema, RPCs, moderation, lifecycle.
--
-- Covers the listing CHECK constraints, the signed-in discovery projection,
-- apply/withdraw/decide, duplicate-pending, blocked exclusion, the application
-- throttle, archived/private denial, listing reports, admin takedown, and the
-- listing lifecycle guards (archive / GM suspend / GM delete).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(37);

-- ==========================================
-- Fixtures (owner: bypasses RLS)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000067a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'app674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'app2-674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arch674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'susp674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a07', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'del674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a08', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'block674@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000067a09', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rate674@test.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000067a04';

-- b01 listed (the main flow), b02 private, b03..b05 lifecycle guards.
INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints, application_prompt)
VALUES
  ('00000000-0000-0000-0000-000000067b01', 'Listed Game', '00000000-0000-0000-0000-000000067a01', 'a0674001', 'approval', 'A weekly campaign.', 'Be kind.', 'Why do you want to join?'),
  ('00000000-0000-0000-0000-000000067b03', 'Archive Me', '00000000-0000-0000-0000-000000067a05', 'a0674003', 'approval', 'Archived soon.', 'Rules.', NULL),
  ('00000000-0000-0000-0000-000000067b04', 'Suspend Me', '00000000-0000-0000-0000-000000067a06', 'a0674004', 'approval', 'Suspended soon.', 'Rules.', NULL),
  ('00000000-0000-0000-0000-000000067b05', 'Delete Me', '00000000-0000-0000-0000-000000067a07', 'a0674005', 'approval', 'Deleted soon.', 'Rules.', NULL);

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000067b02', 'Private Game', '00000000-0000-0000-0000-000000067a01', 'a0674002');

-- The GM is a member of their own channel (message reads + member_count).
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000067b01', '00000000-0000-0000-0000-000000067a01', 'GM');

-- a08 is blocked from b01; a09 is already throttled on b01.
INSERT INTO channel_members (channel_id, user_id, character_name, is_blocked)
VALUES ('00000000-0000-0000-0000-000000067b01', '00000000-0000-0000-0000-000000067a08', 'Blocked', true);

INSERT INTO channel_join_failures (user_id, channel_id, window_start, fail_count)
VALUES ('00000000-0000-0000-0000-000000067a09', '00000000-0000-0000-0000-000000067b01', now(), 5);

-- ==========================================
-- 1. Listing CHECK constraints
-- ==========================================

SELECT throws_ok(
  $$INSERT INTO channels (name, gm_id, invite_code, join_mode)
    VALUES ('NoCopy', '00000000-0000-0000-0000-000000067a01', 'a0674099', 'approval')$$,
  '23514',
  NULL,
  'A listed channel without description/constraints is rejected'
);

SELECT throws_ok(
  $$INSERT INTO channels (name, gm_id, invite_code, join_mode, description, constraints, application_prompt)
    VALUES ('LongPrompt', '00000000-0000-0000-0000-000000067a01', 'a0674098', 'approval', 'd', 'c', repeat('x', 301))$$,
  '23514',
  NULL,
  'An application prompt over 300 characters is rejected'
);

-- ==========================================
-- 2. Listing lifecycle guards
-- ==========================================

UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000067b03';
SELECT is(
  (SELECT join_mode::text FROM channels WHERE id = '00000000-0000-0000-0000-000000067b03'),
  'invite',
  'Archiving a channel delists it'
);

UPDATE profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000067a06';
SELECT is(
  (SELECT join_mode::text FROM channels WHERE id = '00000000-0000-0000-0000-000000067b04'),
  'invite',
  'Suspending a GM delists their channel'
);

DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-000000067a07';
SELECT is(
  (SELECT join_mode::text FROM channels WHERE id = '00000000-0000-0000-0000-000000067b05'),
  'invite',
  'Deleting a GM delists their channel before it is orphaned'
);

-- ==========================================
-- 3. Grant boundary
-- ==========================================

SELECT is(
  has_function_privilege('anon', 'public.list_public_channels(text,text,integer,integer)', 'EXECUTE'),
  false,
  'anon cannot execute list_public_channels'
);
SELECT is(
  has_function_privilege('authenticated', 'public.list_public_channels(text,text,integer,integer)', 'EXECUTE'),
  true,
  'authenticated can execute list_public_channels'
);
SELECT is(
  has_function_privilege('anon', 'public.request_to_join_channel(uuid,text,text)', 'EXECUTE'),
  false,
  'anon cannot execute request_to_join_channel'
);

-- ==========================================
-- 4. Signed-in discovery (as authenticated)
-- ==========================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a02","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM list_public_channels()),
  1::bigint,
  'Discovery returns only the listed, non-archived channel'
);

SELECT is(
  (SELECT name FROM list_public_channels() LIMIT 1),
  'Listed Game',
  'Discovery returns the listed channel name'
);

SELECT is(
  (SELECT pending_request_id FROM get_public_channel('00000000-0000-0000-0000-000000067b01')),
  NULL,
  'No pending request before applying'
);

-- ==========================================
-- 5. Apply / withdraw / decide
-- ==========================================

SELECT ok(
  request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'Aria', 'I love weekly games.') IS NOT NULL,
  'Applying creates a pending request'
);

SELECT throws_ok(
  $$SELECT request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'Aria', 'again')$$,
  NULL,
  'A second application while one is pending is rejected'
);

SELECT isnt(
  (SELECT pending_request_id FROM get_public_channel('00000000-0000-0000-0000-000000067b01')),
  NULL,
  'The detail RPC reports the caller''s pending request'
);

SELECT lives_ok(
  $$SELECT withdraw_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
          AND user_id = '00000000-0000-0000-0000-000000067a02'
          AND status = 'pending'))$$,
  'An applicant can withdraw a pending request'
);

SELECT is(
  (SELECT pending_request_id FROM get_public_channel('00000000-0000-0000-0000-000000067b01')),
  NULL,
  'Withdrawing clears the pending request'
);

SELECT ok(
  request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'Aria', 'please') IS NOT NULL,
  'Re-applying after a withdrawal creates a new pending request'
);

-- GM approves.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a01","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
          AND user_id = '00000000-0000-0000-0000-000000067a02'
          AND status = 'pending'), true)$$,
  'The GM can approve a pending request'
);

SELECT is(
  (SELECT count(*) FROM channel_members
    WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
      AND user_id = '00000000-0000-0000-0000-000000067a02'),
  1::bigint,
  'Approval adds the applicant as a member'
);

SELECT throws_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
          AND user_id = '00000000-0000-0000-0000-000000067a02'
          AND status = 'approved'), true)$$,
  NULL,
  'An already-decided application cannot be decided again'
);

-- The approved applicant now reads the system join message.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a02","role":"authenticated"}', true);

SELECT is(
  (SELECT content FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
      AND sender_id = '00000000-0000-0000-0000-000000067a02'
      AND type = 'system'
    LIMIT 1),
  'Aria joined the channel',
  'Approval posts a system join message with the request character name'
);

-- ==========================================
-- 6. Reject flow + non-GM decide
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a03","role":"authenticated"}', true);

SELECT ok(
  request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'Borin', 'hello') IS NOT NULL,
  'A second applicant can apply'
);

SELECT throws_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
          AND user_id = '00000000-0000-0000-0000-000000067a03'
          AND status = 'pending'), true)$$,
  NULL,
  'A non-GM cannot decide an application'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a01","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT decide_join_request(
      (SELECT id FROM channel_join_requests
        WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
          AND user_id = '00000000-0000-0000-0000-000000067a03'
          AND status = 'pending'), false)$$,
  'The GM can reject a pending request'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a03","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_join_requests
    WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
      AND user_id = '00000000-0000-0000-0000-000000067a03'
      AND status = 'rejected'),
  1::bigint,
  'A rejected application is closed as rejected'
);

-- ==========================================
-- 7. Blocked / throttled / archived denial
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a08', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a08","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM list_public_channels()),
  0::bigint,
  'A blocked user cannot discover the channel'
);
SELECT throws_ok(
  $$SELECT request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'X', 'y')$$,
  NULL,
  'A blocked user cannot apply'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a09', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a09","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'X', 'y')$$,
  NULL,
  'A throttled user cannot apply'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a02","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT request_to_join_channel('00000000-0000-0000-0000-000000067b03', 'X', 'y')$$,
  NULL,
  'An archived (delisted) channel cannot be applied to'
);

SELECT throws_ok(
  $$SELECT request_to_join_channel('00000000-0000-0000-0000-000000067b02', 'X', 'y')$$,
  NULL,
  'A private channel cannot be applied to'
);

-- ==========================================
-- 8. Listing report
-- ==========================================

SELECT lives_ok(
  $$SELECT report_channel_listing('00000000-0000-0000-0000-000000067b01', 'spam listing')$$,
  'A signed-in user can report a listing'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a04', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a04","role":"authenticated"}', true);

SELECT is(
  (SELECT reported_user_id FROM abuse_reports
    WHERE channel_id = '00000000-0000-0000-0000-000000067b01' AND message_id IS NULL
    LIMIT 1),
  '00000000-0000-0000-0000-000000067a01'::uuid,
  'A listing report names the channel GM as the reported party'
);

-- ==========================================
-- 9. Admin takedown
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a02","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT admin_takedown_channel('00000000-0000-0000-0000-000000067b01', 'x')$$,
  NULL,
  'A non-admin cannot take down a listing'
);

-- a03 opens a fresh pending request so the takedown can be seen closing it.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a03","role":"authenticated"}', true);
SELECT ok(
  request_to_join_channel('00000000-0000-0000-0000-000000067b01', 'Borin', 'retry') IS NOT NULL,
  'A rejected applicant can re-apply'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a04', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a04","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT admin_takedown_channel('00000000-0000-0000-0000-000000067b01', 'spam')$$,
  'A server admin can take down a listing'
);

SELECT is(
  (SELECT join_mode::text FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000067b01'),
  'invite',
  'Takedown force-delists the channel'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000067a03', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000067a03","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_join_requests
    WHERE channel_id = '00000000-0000-0000-0000-000000067b01'
      AND user_id = '00000000-0000-0000-0000-000000067a03'
      AND status = 'pending'),
  0::bigint,
  'Takedown closes the channel''s open applications'
);

SELECT * FROM finish();
ROLLBACK;
