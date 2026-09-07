-- #431 [P2.12]: rows raised in the pre-resolution era (dismissed client-side
-- only — persisted dismissal did not exist) stay resolved_at IS NULL forever,
-- which forced the GM catch-up to carry a meaningless created_at horizon and
-- hide flags pressed while the GM was away >7 days. Locks the backfill
-- contract for migration 20260907131618_xcard_backfill_pre_resolution_rows:
--   * pre-cutoff (created_at < '2026-09-06 09:52:25+00') unresolved rows get
--     resolved_at set to the cutoff
--   * pre-cutoff rows that were already resolved keep their original value
--   * post-cutoff unresolved rows (genuinely unhandled) stay NULL
--   * re-running the UPDATE is a no-op (idempotent)
-- The migration body is re-run on simulated legacy state: like the #406 suite,
-- the real migration has already applied during db reset, so the legacy shape
-- is written directly, then the exact UPDATE is executed and asserted.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm431@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000412', 'X-Card backfill', '00000000-0000-0000-0000-000000000411', 'abcdef17');

-- Legacy shape: one unresolved flag from before resolved_at existed, one
-- already-resolved flag from the same era, one post-cutoff unhandled flag.
INSERT INTO safety_card_events (id, channel_id, created_at, resolved_at)
VALUES
  ('00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000412', '2026-08-20 10:00:00+00', NULL),
  ('00000000-0000-0000-0000-000000000414', '00000000-0000-0000-0000-000000000412', '2026-08-21 10:00:00+00', '2026-08-21 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000415', '00000000-0000-0000-0000-000000000412', '2026-09-06 09:52:30+00', NULL);

-- Exact body of migration 20260907131618_xcard_backfill_pre_resolution_rows.
UPDATE safety_card_events
SET resolved_at = '2026-09-06 09:52:25+00'
WHERE created_at < '2026-09-06 09:52:25+00'
  AND resolved_at IS NULL;

SELECT is(
  (SELECT resolved_at FROM safety_card_events WHERE id = '00000000-0000-0000-0000-000000000413'),
  '2026-09-06 09:52:25+00'::timestamptz,
  'pre-cutoff unresolved flag is backfilled as resolved'
);

SELECT is(
  (SELECT resolved_at FROM safety_card_events WHERE id = '00000000-0000-0000-0000-000000000414'),
  '2026-08-21 12:00:00+00'::timestamptz,
  'pre-cutoff already-resolved flag keeps its original resolution time'
);

SELECT is(
  (SELECT resolved_at FROM safety_card_events WHERE id = '00000000-0000-0000-0000-000000000415'),
  NULL,
  'post-cutoff unresolved flag stays surfaced (genuinely unhandled)'
);

-- Idempotency: a second run must change nothing.
UPDATE safety_card_events
SET resolved_at = '2026-09-06 09:52:25+00'
WHERE created_at < '2026-09-06 09:52:25+00'
  AND resolved_at IS NULL;

SELECT is(
  (SELECT array_agg(resolved_at ORDER BY id) FROM safety_card_events WHERE channel_id = '00000000-0000-0000-0000-000000000412'),
  ARRAY['2026-09-06 09:52:25+00'::timestamptz, '2026-08-21 12:00:00+00'::timestamptz, NULL::timestamptz],
  're-running the backfill is a no-op (idempotent)'
);

SELECT * FROM finish();
ROLLBACK;
