-- Push invocation retry: schema, schedule, privilege boundary, and the
-- idempotency behavior (a retried invocation is skipped, the retry carries the
-- attempt count forward, and an already-retried row is left alone).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

SELECT has_column(
  'public',
  'push_invocation_log',
  'retried_at',
  'push_invocation_log tracks when an invocation was retried'
);

SELECT has_column(
  'public',
  'push_invocation_log',
  'attempt',
  'push_invocation_log tracks the retry attempt count'
);

SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'retry-failed-push-invocations'),
  1::bigint,
  'the push retry job is scheduled'
);

SELECT is(
  has_function_privilege('service_role', 'public.retry_failed_push_invocations(integer)', 'EXECUTE'),
  false,
  'service_role cannot call retry_failed_push_invocations'
);

-- Seed config so the function proceeds past its guard.
INSERT INTO push_notification_config (key, value) VALUES
  ('PUSH_FUNCTION_URL', 'https://example.invalid/functions/v1/push-notifications'),
  ('PUSH_INTERNAL_SECRET', 'test-secret');

-- Two failed invocations: A is eligible, B was already retried.
INSERT INTO push_invocation_log (id, request_id, event_kind, entity_id, attempt)
VALUES
  (9001, 900001, 'messages', '00000000-0000-0000-0000-0000000f0001', 0),
  (9002, 900002, 'messages', '00000000-0000-0000-0000-0000000f0002', 0);

-- pg_net recorded a 500 for both.
INSERT INTO net._http_response (id, status_code, timed_out)
VALUES (900001, 500, false), (900002, 500, false);

UPDATE push_invocation_log SET retried_at = now() WHERE id = 9002;

-- First run retries only the eligible one.
SELECT is(
  public.retry_failed_push_invocations(),
  1,
  'only the not-yet-retried failed invocation is retried'
);

SELECT isnt(
  (SELECT retried_at FROM push_invocation_log WHERE id = 9001),
  NULL,
  'the retried source is marked'
);

SELECT is(
  (SELECT attempt FROM push_invocation_log WHERE attempt = 1),
  1,
  'the requeued invocation carries the next attempt count'
);

-- The already-retried row was untouched: still exactly one requeued row.
SELECT is(
  (SELECT count(*) FROM push_invocation_log WHERE attempt = 1),
  1::bigint,
  'an already-retried invocation is not requeued again'
);

SELECT * FROM finish();
ROLLBACK;
