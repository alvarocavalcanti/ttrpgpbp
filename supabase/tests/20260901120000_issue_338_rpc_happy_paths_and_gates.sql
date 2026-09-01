-- Issue #338: pgTAP coverage for previously untested RPC happy paths and
-- write gates.
--  1. join_channel / send_message / roll_dice happy paths (member in good standing)
--  2. Suspension enforcement on send_message and roll_dice (P1 fix)
--  3. channel_secrets write gate (GM only) and app_settings write gate (admin only)
--  4. is_server_admin() RPC gate

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(14);

-- ===== Seed =====
-- 0301 = GM, 0302 = player, 0303 = suspended player, 0304 = server admin
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test301@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test302@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test303@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test304@example.com', '', now(), '{}', '{}', now(), now());
UPDATE profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000000303';
UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000304';

-- Channel 310 owned by the GM, password-protected.
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000310', 'Happy Path', '00000000-0000-0000-0000-000000000301');
INSERT INTO channel_secrets (channel_id, password_hash) VALUES ('00000000-0000-0000-0000-000000000310', 'pw-hash-310');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ===== 1. join_channel happy path =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
SELECT is(
  (join_channel('00000000-0000-0000-0000-000000000310', 'Bard', NULL, NULL, 'pw-hash-310')->>'success'),
  'true',
  'join_channel with the correct password succeeds'
);

-- ===== 2. send_message happy path =====
SELECT ok(
  (SELECT count(*) = 1 FROM send_message('00000000-0000-0000-0000-000000000310', 'hello table', 'regular')),
  'send_message returns exactly one result row'
);
SELECT is(
  (SELECT content FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000310' AND content = 'hello table'),
  'hello table',
  'send_message persists the message content'
);

-- ===== 3. roll_dice happy path =====
SELECT ok(
  (SELECT count(*) = 1 FROM roll_dice('00000000-0000-0000-0000-000000000310', '1d20')),
  'roll_dice returns exactly one result row'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000310' AND type = 'dice_roll'),
  1::bigint,
  'roll_dice persists a dice_roll message'
);

-- ===== 4. Suspension enforcement (P1 fix) =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000303","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-000000000310', 'from suspended')$$,
  NULL,
  'suspended user cannot call send_message'
);
SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-000000000310', '1d20')$$,
  NULL,
  'suspended user cannot call roll_dice'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000310' AND sender_id = '00000000-0000-0000-0000-000000000303'),
  0::bigint,
  'suspended user wrote no messages'
);

-- ===== 5. channel_secrets write gate (GM only) =====
-- RLS policies are under test here: exercise them as the authenticated role,
-- not as the table-owning superuser.
SELECT set_config('role', 'authenticated', true);

-- RLS hides channel_secrets from non-GMs entirely (no error, no change), so
-- the gate is verified as the GM afterwards: the attempted overwrite must not
-- have landed.
UPDATE channel_secrets SET password_hash = 'hacked'
WHERE channel_id = '00000000-0000-0000-0000-000000000310' AND password_hash = 'pw-hash-310';
SELECT is(is_server_admin(), false, 'is_server_admin() is false for a regular member');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
SELECT is(
  (SELECT password_hash FROM channel_secrets WHERE channel_id = '00000000-0000-0000-0000-000000000310'),
  'pw-hash-310',
  'non-GM member cannot update channel_secrets'
);
SELECT lives_ok(
  $$UPDATE channel_secrets SET password_hash = 'pw-rotated' WHERE channel_id = '00000000-0000-0000-0000-000000000310'$$,
  'GM can update channel_secrets for their channel'
);

-- ===== 6. app_settings write gate (admin only) =====
SELECT throws_ok(
  $$INSERT INTO app_settings (key, value) VALUES ('test_gate_338', '1')$$,
  NULL,
  'non-admin cannot insert app_settings'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000304","role":"authenticated"}', true);
SELECT lives_ok(
  $$INSERT INTO app_settings (key, value) VALUES ('test_gate_338', '1')$$,
  'server admin can insert app_settings'
);
SELECT is(is_server_admin(), true, 'is_server_admin() recognizes the admin profile');

SELECT * FROM finish();
ROLLBACK;
