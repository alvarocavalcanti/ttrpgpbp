BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(2);
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test209@example.com', '', now(), '{}', '{}', now(), now());
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000219', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test219@example.com', '', now(), '{}', '{}', now(), now());
UPDATE profiles SET display_name = 'Suspended', is_suspended = true WHERE id = '00000000-0000-0000-0000-000000000209';
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000209', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000209","role":"authenticated"}', true);
SELECT is(join_channel('00000000-0000-0000-0000-000000000002', 'Char'), '{"success": false, "error": "Account suspended."}'::jsonb);
-- #300: direct is_suspended flips are now blocked while authenticated. Clear
-- the JWT so this reset runs as postgres (auth.uid() = NULL), like a dashboard
-- edit, instead of being rejected by the suspension trigger.
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE profiles SET is_suspended = false WHERE id = '00000000-0000-0000-0000-000000000209';
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000210', 'Test', '00000000-0000-0000-0000-000000000209');
INSERT INTO channel_secrets (channel_id, password_hash) VALUES ('00000000-0000-0000-0000-000000000210', 'hash');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000219', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000219","role":"authenticated"}', true);
SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000209', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000209","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
