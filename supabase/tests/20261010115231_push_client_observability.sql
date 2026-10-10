-- Push client observability: per-subscription ack_token default, the
-- push_client_log status CHECK, and the row-level ownership rules (a user may
-- insert/read only their own milestone rows).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clientlog-a@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clientlog-b@example.com', '', now(), '{}', '{}', now(), now());

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. ack_token is auto-populated =====
INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
VALUES ('00000000-0000-0000-0000-00000000c001', 'https://push.example/e', 'p', 'a');
SELECT isnt(
  (SELECT ack_token FROM push_subscriptions WHERE user_id = '00000000-0000-0000-0000-00000000c001'),
  NULL,
  'ack_token defaults to a fresh uuid'
);

-- Seed one row owned by user A (inserted as the owner, bypassing RLS).
INSERT INTO push_client_log (user_id, status, detail)
VALUES ('00000000-0000-0000-0000-00000000c001', 'shown', 'seed');

-- ===== 2. A user cannot read another user's rows =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-00000000c002');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM push_client_log), 0::bigint, 'user cannot read another user''s rows');
RESET ROLE;

-- ===== 3. A user can insert a row for themselves =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-00000000c002');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO push_client_log (user_id, status) VALUES ('00000000-0000-0000-0000-00000000c002', 'subscribed')$$,
  'user can insert their own row'
);
RESET ROLE;

-- ===== 4. A user cannot insert a row for someone else =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-00000000c002');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO push_client_log (user_id, status) VALUES ('00000000-0000-0000-0000-00000000c001', 'shown')$$,
  '42501',
  NULL,
  'user cannot insert a row for another user'
);
RESET ROLE;

-- ===== 5. An unknown status is rejected by the CHECK constraint =====
SELECT throws_ok(
  $$INSERT INTO push_client_log (user_id, status) VALUES ('00000000-0000-0000-0000-00000000c001', 'delivered')$$,
  '23514',
  NULL,
  'unknown status rejected'
);

SELECT * FROM finish();
ROLLBACK;
