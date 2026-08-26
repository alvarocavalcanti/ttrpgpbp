BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

-- Fixture: a channel with a GM, one member, and a non-member.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000410', 'Test', '00000000-0000-0000-0000-000000000400', 'code');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000400', 'GM', now()),
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'P1', now());

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- The bucket must be private (reads require the SELECT policy or a signed URL).
SELECT ok((SELECT NOT public FROM storage.buckets WHERE id = 'images'), 'images bucket is private');

-- The remaining inserts/toggles run as postgres (bypasses RLS but NOT the write
-- guard trigger, which is exactly what we are testing). authenticated cannot
-- toggle app_settings (admin-only), so these must happen before SET ROLE.
UPDATE app_settings SET value = 'true' WHERE key = 'image_uploading_enabled';

-- Fixture object owned by the channel (first path segment = channel id).
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES ('images', '00000000-0000-0000-0000-000000000410/message/u1.jpg', '00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000400',
        '{"mimetype":"image/jpeg","size":1024}'::jsonb);

-- === Server-side write guard (trigger) ===
-- Accepted when enabled and within the size cap.
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES ('images', '00000000-0000-0000-0000-000000000410/message/u2.jpg', '00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000400',
        '{"mimetype":"image/jpeg","size":2048}'::jsonb);
SELECT ok(true, 'upload accepted when enabled and within size cap');

-- Non-image rejected.
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
    VALUES ('images', '00000000-0000-0000-0000-000000000410/message/u3.txt', '00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000400',
            '{"mimetype":"text/plain","size":1024}'::jsonb)$$,
  'Only image files may be uploaded',
  'non-image upload rejected'
);

-- Oversized rejected (default cap 5 MB).
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
    VALUES ('images', '00000000-0000-0000-0000-000000000410/message/u4.jpg', '00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000400',
            '{"mimetype":"image/jpeg","size":5368709121}'::jsonb)$$,
  'Image exceeds the 5 MB size limit',
  'oversized upload rejected'
);

-- Disabled by admin rejected.
UPDATE app_settings SET value = 'false' WHERE key = 'image_uploading_enabled';
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
    VALUES ('images', '00000000-0000-0000-0000-000000000410/message/u5.jpg', '00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000400',
            '{"mimetype":"image/jpeg","size":1024}'::jsonb)$$,
  'Image uploads are disabled by the server admin',
  'upload rejected when disabled by admin'
);

-- === Read gating (storage.objects SELECT policy) ===
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
SET LOCAL ROLE authenticated;

-- Member (GM) can read the channel's image.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000400', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000400","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'images' AND name LIKE '00000000-0000-0000-0000-000000000410/%'$$,
  $$VALUES ('00000000-0000-0000-0000-000000000410/message/u1.jpg'::text), ('00000000-0000-0000-0000-000000000410/message/u2.jpg'::text)$$,
  'Channel member can read the channel images'
);

-- Non-member cannot see any image.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
SELECT is_empty(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'images' AND name LIKE '00000000-0000-0000-0000-000000000410/%'$$,
  'Non-member cannot read the channel images'
);

SELECT * FROM finish();
ROLLBACK;