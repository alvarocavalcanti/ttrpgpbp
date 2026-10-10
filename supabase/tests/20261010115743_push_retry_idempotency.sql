-- Push invocation retry idempotency + scheduling. The retry function must be
-- safe to run on a schedule: a retried invocation is marked so a second run
-- does not re-send it, and the schedule itself is owned by pg_cron (so the
-- revoked EXECUTE grants keep the function off the API surface).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

SELECT has_column(
  'public',
  'push_invocation_log',
  'retried_at',
  'push_invocation_log tracks when an invocation was retried'
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

SELECT * FROM finish();
ROLLBACK;
