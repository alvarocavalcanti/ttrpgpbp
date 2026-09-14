BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

-- Fixture: a GM to own the objects.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm2@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000510', 'Test2', '00000000-0000-0000-0000-000000000500', 'abcdef34');

-- The guard only fires while uploads are enabled (admin-only setting, so set it
-- before any role switch).
UPDATE app_settings SET value = 'true' WHERE key = 'image_uploading_enabled';

-- Whole-pixel dimensions within range are kept.
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES ('images', '00000000-0000-0000-0000-000000000510/message/ok.jpg', '00000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-000000000500',
        '{"mimetype":"image/jpeg","size":1024,"width":512,"height":288}'::jsonb);

SELECT is(
  (SELECT metadata->>'width' FROM storage.objects
    WHERE name = '00000000-0000-0000-0000-000000000510/message/ok.jpg'),
  '512',
  'sane width is kept'
);

SELECT is(
  (SELECT metadata->>'height' FROM storage.objects
    WHERE name = '00000000-0000-0000-0000-000000000510/message/ok.jpg'),
  '288',
  'sane height is kept'
);

-- Absurd values are stripped so no client can reserve an enormous box.
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES ('images', '00000000-0000-0000-0000-000000000510/message/bad.jpg', '00000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-000000000500',
        '{"mimetype":"image/jpeg","size":1024,"width":999999999,"height":-5}'::jsonb);

SELECT ok(
  (SELECT NOT (metadata ? 'width') AND NOT (metadata ? 'height') FROM storage.objects
    WHERE name = '00000000-0000-0000-0000-000000000510/message/bad.jpg'),
  'out-of-range dimensions are stripped'
);

SELECT * FROM finish();
ROLLBACK;
