-- #674 Phase 3b: join request push notifications.
--
-- Covers the trigger (both phases), the events that must NOT notify, and the
-- retry routing — the retry rebuilds its payload from event_kind alone, so a new
-- kind with no branch there would be re-posted as a `messages` payload and lost.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

-- ==========================================
-- Fixtures (owner: bypasses RLS)
-- ==========================================

INSERT INTO push_notification_config (key, value) VALUES
  ('PUSH_FUNCTION_URL', 'https://example.invalid/functions/v1/push-notifications'),
  ('PUSH_INTERNAL_SECRET', 'test-secret');

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000069a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm678@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000069a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'app678@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints)
VALUES ('00000000-0000-0000-0000-000000069b01', 'Listed Game', '00000000-0000-0000-0000-000000069a01', 'a0678001', 'approval', 'A weekly campaign.', 'Be kind.');

-- The payload the edge function receives, decoded from pg_net's bytea body.
CREATE OR REPLACE FUNCTION pg_temp.queued_body(p_request_id bigint)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT convert_from(body, 'UTF8')::jsonb FROM net.http_request_queue WHERE id = p_request_id;
$$;

-- ==========================================
-- 1. A new application notifies the GM
-- ==========================================

INSERT INTO channel_join_requests (id, channel_id, user_id, character_name, message)
VALUES ('00000000-0000-0000-0000-000000069c01', '00000000-0000-0000-0000-000000069b01', '00000000-0000-0000-0000-000000069a02', 'Aria', 'I would love to join.');

SELECT is(
  (SELECT event_kind FROM push_invocation_log WHERE entity_id = '00000000-0000-0000-0000-000000069c01'),
  'join_request',
  'A new application queues a join_request push'
);

SELECT is(
  pg_temp.queued_body((SELECT request_id FROM push_invocation_log WHERE entity_id = '00000000-0000-0000-0000-000000069c01'))->>'table',
  'channel_join_requests',
  'The GM push targets the join request table'
);

SELECT is(
  pg_temp.queued_body((SELECT request_id FROM push_invocation_log WHERE entity_id = '00000000-0000-0000-0000-000000069c01'))->>'phase',
  'received',
  'The GM push is marked received, so a retry cannot re-route it'
);

-- ==========================================
-- 2. A decision notifies the applicant
-- ==========================================

UPDATE channel_join_requests
  SET status = 'approved', decided_at = now()
  WHERE id = '00000000-0000-0000-0000-000000069c01';

SELECT is(
  (SELECT count(*) FROM push_invocation_log
    WHERE entity_id = '00000000-0000-0000-0000-000000069c01' AND event_kind = 'join_request_decided'),
  1::bigint,
  'Approving queues a join_request_decided push'
);

SELECT is(
  pg_temp.queued_body((
    SELECT request_id FROM push_invocation_log
    WHERE entity_id = '00000000-0000-0000-0000-000000069c01' AND event_kind = 'join_request_decided'
  ))->>'phase',
  'decided',
  'The applicant push is marked decided'
);

-- ==========================================
-- 3. Silence where nothing should be sent
-- ==========================================

INSERT INTO channel_join_requests (id, channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000069c02', '00000000-0000-0000-0000-000000069b01', '00000000-0000-0000-0000-000000069a02', 'Borin');

UPDATE channel_join_requests
  SET status = 'withdrawn', decided_at = now()
  WHERE id = '00000000-0000-0000-0000-000000069c02';

SELECT is(
  (SELECT count(*) FROM push_invocation_log
    WHERE entity_id = '00000000-0000-0000-0000-000000069c02' AND event_kind = 'join_request_decided'),
  0::bigint,
  'Withdrawing an application notifies nobody'
);

-- A repeated approval of an already-decided request must not notify again.
UPDATE channel_join_requests
  SET status = 'approved'
  WHERE id = '00000000-0000-0000-0000-000000069c01';

SELECT is(
  (SELECT count(*) FROM push_invocation_log
    WHERE entity_id = '00000000-0000-0000-0000-000000069c01' AND event_kind = 'join_request_decided'),
  1::bigint,
  'Repeating a decision does not notify the applicant twice'
);

-- ==========================================
-- 4. Retry routing
-- ==========================================

INSERT INTO push_invocation_log (id, request_id, event_kind, entity_id, attempt)
VALUES
  (9201, 920001, 'join_request', '00000000-0000-0000-0000-000000069c01', 0),
  (9202, 920002, 'join_request_decided', '00000000-0000-0000-0000-000000069c01', 0);

INSERT INTO net._http_response (id, status_code, timed_out)
VALUES (920001, 500, false), (920002, 500, false);

SELECT is(
  public.retry_failed_push_invocations(),
  2,
  'Both failed join request pushes are retried'
);

SELECT is(
  pg_temp.queued_body((
    SELECT request_id FROM push_invocation_log
    WHERE attempt = 1 AND event_kind = 'join_request'
    ORDER BY id DESC LIMIT 1
  ))->>'phase',
  'received',
  'A retried received push keeps its phase'
);

SELECT is(
  pg_temp.queued_body((
    SELECT request_id FROM push_invocation_log
    WHERE attempt = 1 AND event_kind = 'join_request_decided'
    ORDER BY id DESC LIMIT 1
  ))->>'phase',
  'decided',
  'A retried decided push keeps its phase'
);

SELECT is(
  pg_temp.queued_body((
    SELECT request_id FROM push_invocation_log
    WHERE attempt = 1 AND event_kind = 'join_request_decided'
    ORDER BY id DESC LIMIT 1
  ))->>'table',
  'channel_join_requests',
  'A retried join push is not re-routed to the messages branch'
);

-- ==========================================
-- 5. Grant boundary
-- ==========================================

SELECT is(
  has_function_privilege('authenticated', 'public.handle_join_request_notification()', 'EXECUTE'),
  false,
  'The trigger helper is not directly callable by an API role'
);

SELECT * FROM finish();
ROLLBACK;
