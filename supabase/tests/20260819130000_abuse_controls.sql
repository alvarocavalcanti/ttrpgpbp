BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(3);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test209@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET display_name = 'Suspended', is_suspended = true WHERE id = '00000000-0000-0000-0000-000000000209';

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000209', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000209","role":"authenticated"}', true);

-- Test 1: Global suspension prevents joining channel
SELECT throws_ok(
  $$ SELECT join_channel('00000000-0000-0000-0000-000000000002', 'Char') $$,
  'Account suspended.'
);

UPDATE profiles SET is_suspended = false WHERE id = '00000000-0000-0000-0000-000000000209';

INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000210', 'Test', '00000000-0000-0000-0000-000000000209');
INSERT INTO channel_secrets (channel_id, password_hash) VALUES ('00000000-0000-0000-0000-000000000210', 'hash');

SELECT throws_ok($$ SELECT join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong') $$, 'Invalid password or invite code');
SELECT throws_ok($$ SELECT join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong') $$, 'Invalid password or invite code');
SELECT throws_ok($$ SELECT join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong') $$, 'Invalid password or invite code');
SELECT throws_ok($$ SELECT join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong') $$, 'Invalid password or invite code');
SELECT throws_ok($$ SELECT join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong') $$, 'Rate limit exceeded for password attempts. Please wait and try again.');

-- Test 3: Rate limiting blocks repeated actions (create channel, limit 5)
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000211', 'T1', '00000000-0000-0000-0000-000000000209');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000212', 'T2', '00000000-0000-0000-0000-000000000209');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000213', 'T3', '00000000-0000-0000-0000-000000000209');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000214', 'T4', '00000000-0000-0000-0000-000000000209');
SELECT throws_ok($$ INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000215', 'T5', '00000000-0000-0000-0000-000000000209') $$, 'Rate limit exceeded for create_channel');

SELECT * FROM finish();
ROLLBACK;
