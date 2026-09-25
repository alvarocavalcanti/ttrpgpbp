-- 2026-09-25 final audit security P2: abuse-report de-duplication. The
-- migration must reconcile existing duplicates before creating the unique
-- index, or it fails on a database that already holds them. This test
-- simulates that pre-migration state, applies the reconciliation, and asserts
-- one report per (reporter, message) survives.
-- See supabase/migrations/20260925163924_abuse_report_dedupe.sql.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(2);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dedupe301reporter@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000009302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dedupe301target@example.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000009310', 'Dedupe Channel', '00000000-0000-0000-0000-000000009301');
INSERT INTO channel_members (channel_id, user_id, character_name) VALUES ('00000000-0000-0000-0000-000000009310', '00000000-0000-0000-0000-000000009301', 'Reporter');
INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000009315', '00000000-0000-0000-0000-000000009310', '00000000-0000-0000-0000-000000009302', 'regular', 'reported message');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009301","role":"authenticated"}', true);

-- Simulate the pre-migration state: no unique index and two duplicate reports
-- for the same (reporter, message) pair.
DROP INDEX public.abuse_reports_reporter_message_unique;
INSERT INTO abuse_reports (id, reporter_id, reported_user_id, channel_id, message_id, reason, created_at)
VALUES
  ('00000000-0000-0000-0000-000000009320', '00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000009302', '00000000-0000-0000-0000-000000009310', '00000000-0000-0000-0000-000000009315', 'first', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000009321', '00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000009302', '00000000-0000-0000-0000-000000009310', '00000000-0000-0000-0000-000000009315', 'second', '2026-01-02T00:00:00Z');

-- Apply the migration's reconciliation, then recreate the index.
DELETE FROM public.abuse_reports a
USING public.abuse_reports b
WHERE a.message_id IS NOT NULL
  AND a.reporter_id = b.reporter_id
  AND a.message_id = b.message_id
  AND a.id <> b.id
  AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX abuse_reports_reporter_message_unique
  ON public.abuse_reports (reporter_id, message_id)
  WHERE message_id IS NOT NULL;

SELECT is(
  (SELECT count(*) FROM abuse_reports WHERE message_id = '00000000-0000-0000-0000-000000009315'),
  1::bigint,
  'reconciliation keeps one report per (reporter, message)'
);

SELECT throws_ok(
  $$INSERT INTO abuse_reports (reporter_id, reported_user_id, channel_id, message_id, reason)
    VALUES ('00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000009302', '00000000-0000-0000-0000-000000009310', '00000000-0000-0000-0000-000000009315', 'third')$$,
  '23505',
  NULL,
  'the recreated index rejects further duplicates'
);

SELECT * FROM finish();
ROLLBACK;
