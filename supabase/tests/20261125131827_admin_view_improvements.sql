-- #788: admin channel RPCs expose the per-channel character portrait and the
-- room a message belongs to, and the server admin can read a channel object
-- from the private images bucket without being a channel member.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000788', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin788@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000789', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm788@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000790', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger788@test.com', '', now(), '{}', '{}', now(), now());

-- handle_new_user creates these profile rows.
UPDATE profiles SET display_name = 'Admin', server_admin = true
WHERE id = '00000000-0000-0000-0000-000000000788';
UPDATE profiles SET display_name = 'Gina GM', avatar_url = '00000000-0000-0000-0000-000000000789/profile/a.jpg'
WHERE id = '00000000-0000-0000-0000-000000000789';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000791', 'Portrait Quest', '00000000-0000-0000-0000-000000000789', 'd788d788');

INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, last_read_at)
VALUES (
  '00000000-0000-0000-0000-000000000791',
  '00000000-0000-0000-0000-000000000789',
  'Gina the DM',
  '00000000-0000-0000-0000-000000000791/character/gina.jpg',
  now()
);

INSERT INTO sub_channels (id, channel_id, name)
VALUES ('00000000-0000-0000-0000-000000000792', '00000000-0000-0000-0000-000000000791', 'OOC');

INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000793', '00000000-0000-0000-0000-000000000791',
   '00000000-0000-0000-0000-000000000789', 'regular', 'Main line', NULL, now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-000000000794', '00000000-0000-0000-0000-000000000791',
   '00000000-0000-0000-0000-000000000789', 'regular', 'Room line', '00000000-0000-0000-0000-000000000792', now() - interval '1 minute');

-- The upload guard trigger rejects this insert while uploads are disabled.
UPDATE app_settings SET value = 'true' WHERE key = 'image_uploading_enabled';

INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES ('images', '00000000-0000-0000-0000-000000000791/character/gina.jpg',
        '00000000-0000-0000-0000-000000000789', '00000000-0000-0000-0000-000000000789',
        '{"mimetype":"image/jpeg","size":1024}'::jsonb);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Guard: a non-admin cannot read the roster =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000790');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM admin_list_channel_members('00000000-0000-0000-0000-000000000791')$$,
  'P0001', 'Not authorized',
  'non-admin cannot list channel members'
);
RESET ROLE;

-- ===== 2-8. Admin payload =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000788');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT character_avatar_url FROM admin_list_channel_members('00000000-0000-0000-0000-000000000791')),
  '00000000-0000-0000-0000-000000000791/character/gina.jpg',
  'roster returns the per-channel character portrait'
);

SELECT is(
  (SELECT avatar_url FROM admin_list_channel_members('00000000-0000-0000-0000-000000000791')),
  '00000000-0000-0000-0000-000000000789/profile/a.jpg',
  'roster returns the account picture'
);

SELECT is(
  (SELECT sender_character_avatar_url FROM admin_list_channel_messages('00000000-0000-0000-0000-000000000791')
   WHERE id = '00000000-0000-0000-0000-000000000793'),
  '00000000-0000-0000-0000-000000000791/character/gina.jpg',
  'message row returns the sender character portrait'
);

SELECT is(
  (SELECT sender_avatar_url FROM admin_list_channel_messages('00000000-0000-0000-0000-000000000791')
   WHERE id = '00000000-0000-0000-0000-000000000793'),
  '00000000-0000-0000-0000-000000000789/profile/a.jpg',
  'message row returns the sender account picture'
);

SELECT is(
  (SELECT sub_channel_name FROM admin_list_channel_messages('00000000-0000-0000-0000-000000000791')
   WHERE id = '00000000-0000-0000-0000-000000000793'),
  NULL::text,
  'a Main message carries no room name'
);

SELECT is(
  (SELECT sub_channel_name FROM admin_list_channel_messages('00000000-0000-0000-0000-000000000791')
   WHERE id = '00000000-0000-0000-0000-000000000794'),
  'OOC',
  'a room message carries its room name'
);

SELECT is(
  (SELECT count(*) FROM storage.objects
   WHERE bucket_id = 'images' AND name LIKE '00000000-0000-0000-0000-000000000791/%'),
  1::bigint,
  'server admin reads a channel object without being a member'
);

RESET ROLE;

-- ===== 9. A signed-in non-member still cannot read it =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000790');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT name FROM storage.objects
    WHERE bucket_id = 'images' AND name LIKE '00000000-0000-0000-0000-000000000791/%'$$,
  'non-admin non-member still cannot read a channel object'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
