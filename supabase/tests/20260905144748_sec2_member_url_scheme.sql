-- Issue #402 / SEC-2: channel_members.character_sheet_url /
-- character_avatar_url now enforce the same WHATWG-normalized URL scheme
-- contract as channels: explicit non-http(s) schemes are rejected
-- (javascript:, data:, tab-prefixed variants), scheme-less relative storage
-- paths and absolute http(s) URLs pass.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm402@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p402@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000411', 'URL scheme', '00000000-0000-0000-0000-000000000402', 'abcdef14');

-- Exotic scheme on the sheet link is rejected.
SELECT throws_ok(
  $$INSERT INTO channel_members (id, channel_id, user_id, character_name, character_sheet_url)
    VALUES ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000411',
            '00000000-0000-0000-0000-000000000403', 'P1', 'javascript:alert(1)')$$,
  NULL,
  'javascript: sheet url is rejected'
);

-- Obfuscated data: URI (tab + leading whitespace) is rejected too.
SELECT throws_ok(
  $$INSERT INTO channel_members (id, channel_id, user_id, character_name, character_sheet_url)
    VALUES ('00000000-0000-0000-0000-000000000422', '00000000-0000-0000-0000-000000000411',
            '00000000-0000-0000-0000-000000000403', 'P1', E'\t data:text/html,<script>')$$,
  NULL,
  'whitespace-prefixed data: sheet url is rejected'
);

-- Exotic scheme on the avatar is rejected.
SELECT throws_ok(
  $$INSERT INTO channel_members (id, channel_id, user_id, character_name, character_avatar_url)
    VALUES ('00000000-0000-0000-0000-000000000423', '00000000-0000-0000-0000-000000000411',
            '00000000-0000-0000-0000-000000000403', 'P1', 'data:image/svg+xml;base64,AAAA')$$,
  NULL,
  'data: avatar url is rejected'
);

-- Relative storage path (canonical avatar format) passes.
SELECT lives_ok(
  $$INSERT INTO channel_members (id, channel_id, user_id, character_name, character_avatar_url, character_sheet_url)
    VALUES ('00000000-0000-0000-0000-000000000424', '00000000-0000-0000-0000-000000000411',
            '00000000-0000-0000-0000-000000000403', 'P1', '00000000-0000-0000-0000-000000000411/avatar/x.jpg',
            'https://dndbeyond.com/chars/1')$$,
  'relative avatar path and https sheet url pass'
);

-- Whitespace-prefixed https keeps passing (stored value untouched).
SELECT lives_ok(
  $$UPDATE channel_members SET character_sheet_url = ' https://example.com/sheet'
    WHERE id = '00000000-0000-0000-0000-000000000424'$$,
  'whitespace-prefixed https sheet url passes'
);

-- The channels trigger still behaves identically through the shared helper.
SELECT lives_ok(
  $$UPDATE channels SET map_url = 'https://example.com/map'
    WHERE id = '00000000-0000-0000-0000-000000000411'$$,
  'channels map_url update via shared helper passes'
);
SELECT throws_ok(
  $$UPDATE channels SET map_url = 'javascript:alert(1)'
    WHERE id = '00000000-0000-0000-0000-000000000411'$$,
  NULL,
  'channels javascript: map_url still rejected'
);

SELECT * FROM finish();
ROLLBACK;
