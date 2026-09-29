BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

-- Fixture: a channel GM/owner, one member, and one authenticated non-member.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000610', 'Test', '00000000-0000-0000-0000-000000000600', 'abcdef56');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000620', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000600', 'GM', now()),
  ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'P1', now());

-- The write-guard trigger only fires while uploads are enabled; the read
-- policy under test applies regardless.
UPDATE app_settings SET value = 'true' WHERE key = 'image_uploading_enabled';

INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES
  ('images', '00000000-0000-0000-0000-000000000600/profile/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg', '00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000600',
          '{"mimetype":"image/jpeg","size":1024}'::jsonb),
  ('images', '00000000-0000-0000-0000-000000000610/message/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg', '00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000600',
          '{"mimetype":"image/jpeg","size":1024}'::jsonb);

GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
SET LOCAL ROLE authenticated;

-- The owner can read their own profile picture.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000600', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000600","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'images' AND name = '00000000-0000-0000-0000-000000000600/profile/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'$$,
  $$VALUES ('00000000-0000-0000-0000-000000000600/profile/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'::text)$$,
  'Profile owner can read their profile picture'
);

-- An authenticated non-member can read another user's profile picture.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'images' AND name = '00000000-0000-0000-0000-000000000600/profile/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'$$,
  $$VALUES ('00000000-0000-0000-0000-000000000600/profile/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'::text)$$,
  'Authenticated user can read another profile picture'
);

-- The same non-member cannot read the channel image.
SELECT is_empty(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'images' AND name = '00000000-0000-0000-0000-000000000610/message/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'$$,
  'Non-member cannot read the channel image'
);

-- A channel member still can.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'images' AND name = '00000000-0000-0000-0000-000000000610/message/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'$$,
  $$VALUES ('00000000-0000-0000-0000-000000000610/message/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'::text)$$,
  'Channel member can read the channel image'
);

SELECT * FROM finish();
ROLLBACK;
