-- Issue #337: realtime privacy & DB hardening.
--
-- Covers: X-Card GM-only SELECT, channel_members insert consent (no force-add),
-- member.attributes clamping on self-update, roll_dice notation/DC bounds,
-- send_message idempotent replay, invite_code format constraint, URL scheme
-- validation on channels, abuse_reports.reason cap, mark_admin_thread_read
-- visibility.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(18);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000409', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337a@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337b@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337admin@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000421';

-- 409 = GM of channel 410; 410 & 411 are members.
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000410', 'Channel 337', '00000000-0000-0000-0000-000000000409');
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000410', 'Player A'),
  ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000411', 'Player B');

-- DM thread for player A (created by admin), with a message.
INSERT INTO admin_threads (id, type, gm_id, created_by)
VALUES ('00000000-0000-0000-0000-000000000441', 'dm',
  '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000421');
INSERT INTO admin_messages (thread_id, sender_id, content)
VALUES ('00000000-0000-0000-0000-000000000441', '00000000-0000-0000-0000-000000000421', 'hello');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. X-Card: only the GM can SELECT the event stream =====
INSERT INTO safety_card_events (channel_id) VALUES ('00000000-0000-0000-0000-000000000410');

SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000410'); -- player A
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM safety_card_events WHERE channel_id = '00000000-0000-0000-0000-000000000410'),
  0::bigint,
  'member cannot SELECT X-Card events'
);
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000409'); -- GM
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM safety_card_events WHERE channel_id = '00000000-0000-0000-0000-000000000410'),
  1::bigint,
  'GM can SELECT X-Card events'
);
RESET ROLE;

-- Members can still trigger the X-Card.
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000411'); -- player B
SELECT lives_ok(
  $$INSERT INTO safety_card_events (channel_id) VALUES ('00000000-0000-0000-0000-000000000410')$$,
  'member can still trigger X-Card'
);

-- ===== 2. GM cannot force-add another user =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000409'); -- GM
SELECT throws_ok(
  $$INSERT INTO channel_members (channel_id, user_id, character_name)
    VALUES ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000411', 'Forced')$$,
  'You can only join a channel as yourself.'
);

-- Self-join direct insert still works (e.g. recovery path).
SELECT lives_ok(
  $$INSERT INTO channel_members (channel_id, user_id, character_name, attributes)
    VALUES ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000409', 'Me', '{}'::jsonb)$$,
  'authenticated user can add themselves'
);

-- ===== 3. member.attributes clamped on self-update =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000410'); -- player A
UPDATE channel_members
SET attributes = '{"STR": 99, "WIS": -99, "junk": "abc"}'::jsonb
WHERE channel_id = '00000000-0000-0000-0000-000000000410'
  AND user_id = '00000000-0000-0000-0000-000000000410';

SELECT is(
  (SELECT attributes FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-000000000410'
     AND user_id = '00000000-0000-0000-0000-000000000410'),
  '{"STR": 5, "WIS": -4}'::jsonb,
  'attributes clamped to -4..5 and non-numeric keys dropped'
);

-- ===== 4. roll_dice input bounds =====
SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-000000000410', repeat('1d20+', 15))$$,
  'Dice notation is too long (max 50 characters).'
);
SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-000000000410', '1d20', NULL, NULL, 0)$$,
  'DC must be between 1 and 100.'
);
SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-000000000410', '1d20', NULL, NULL, 101)$$,
  'DC must be between 1 and 100.'
);

-- ===== 5. send_message idempotent replay =====
CREATE OR REPLACE FUNCTION pg_temp.send_twice()
RETURNS TABLE (first_id uuid, second_id uuid, stored bigint) AS $$
DECLARE
  a uuid;
  b uuid;
BEGIN
  SELECT message_id INTO a FROM send_message(
    '00000000-0000-0000-0000-000000000410', 'hello idem', 'regular',
    NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000000442');
  SELECT message_id INTO b FROM send_message(
    '00000000-0000-0000-0000-000000000410', 'hello idem', 'regular',
    NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000000442');
  RETURN QUERY SELECT a, b, (SELECT count(*) FROM messages WHERE client_request_id = '00000000-0000-0000-0000-000000000442');
END;
$$ LANGUAGE plpgsql;

SELECT is(
  (SELECT first_id = second_id AND stored = 1 FROM pg_temp.send_twice()),
  true,
  'send_message replay returns the original message, stored once'
);

SELECT is(
  (SELECT count(*) FROM messages WHERE client_request_id = '00000000-0000-0000-0000-000000000442'),
  1::bigint,
  'only one message stored for the replayed key'
);

-- ===== 6. invite_code format constraint =====
SELECT throws_ok(
  $$INSERT INTO channels (id, name, gm_id, invite_code)
    VALUES ('00000000-0000-0000-0000-000000000412', 'Bad code', '00000000-0000-0000-0000-000000000409', 'not-hex!')$$,
  NULL,
  'invite_code must be 8 hex chars'
);
SELECT lives_ok(
  $$INSERT INTO channels (id, name, gm_id, invite_code)
    VALUES ('00000000-0000-0000-0000-000000000413', 'Good code', '00000000-0000-0000-0000-000000000409', 'abcdef12')$$,
  '8-hex invite_code accepted'
);

-- ===== 7. URL scheme validation on channels =====
SELECT throws_ok(
  $$UPDATE channels SET map_url = 'javascript:alert(1)'
    WHERE id = '00000000-0000-0000-0000-000000000410'$$,
  'URLs must start with http:// or https://'
);
SELECT lives_ok(
  $$UPDATE channels SET map_url = 'https://owlbear.rodeo/x', resources_url = 'http://example.com'
    WHERE id = '00000000-0000-0000-0000-000000000410'$$,
  'http(s) URLs accepted'
);

-- ===== 8. abuse_reports.reason cap =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000410');
SELECT throws_ok(
  $$INSERT INTO abuse_reports (reporter_id, reported_user_id, reason)
    VALUES ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000411', repeat('x', 1001))$$,
  NULL,
  'reason over 1000 chars rejected'
);

-- ===== 9. mark_admin_thread_read visibility =====
-- Player B cannot mark player A's DM thread read.
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000411');
SELECT throws_ok(
  $$SELECT mark_admin_thread_read('00000000-0000-0000-0000-000000000441')$$,
  'Thread not found.'
);
-- Participant can.
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000410');
SELECT lives_ok(
  $$SELECT mark_admin_thread_read('00000000-0000-0000-0000-000000000441')$$,
  'participant can mark own DM thread read'
);

SELECT * FROM finish();
ROLLBACK;
