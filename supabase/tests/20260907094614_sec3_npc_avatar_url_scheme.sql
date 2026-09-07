-- Issue #429 / SEC-3: channel_npcs.avatar_url and messages.npc_avatar_url now
-- enforce the same WHATWG-normalized URL scheme contract as
-- channels/channel_members: explicit non-http(s) schemes are rejected
-- (javascript:, data:, tab-prefixed variants), scheme-less relative storage
-- paths, absolute http(s) URLs and '' pass. The 500-char caps predate this
-- migration (20260818140000) and are re-checked here for both columns.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000042901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm429@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000042902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p429@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id)
VALUES ('00000000-0000-0000-0000-000000042911', 'NPC urls', '00000000-0000-0000-0000-000000042901');
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000042911', '00000000-0000-0000-0000-000000042901', 'GM');

-- ===== channel_npcs.avatar_url =====

-- Exotic scheme is rejected.
SELECT throws_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', 'Goblin', 'javascript:alert(1)')$$,
  NULL,
  'javascript: npc avatar is rejected'
);

-- Obfuscated scheme (tab + leading whitespace) is rejected too.
SELECT throws_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', 'Goblin', E'\t data:text/html,<script>')$$,
  NULL,
  'whitespace-prefixed data: npc avatar is rejected'
);

-- Relative storage path (canonical avatar format) and https pass.
SELECT lives_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', 'Wisp',
            '00000000-0000-0000-0000-000000042911/npc/wisp.png')$$,
  'relative storage path passes'
);
SELECT lives_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', 'Owl',
            'https://example.com/owl.png')$$,
  'https npc avatar passes'
);

-- '' stays legal (unset portrait).
SELECT lives_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', 'Shade', '')$$,
  'empty-string npc avatar passes'
);

-- The pre-existing 500-char cap still holds.
SELECT throws_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', 'Long', repeat('a', 501))$$,
  NULL,
  'npc avatar over 500 chars is rejected'
);

-- Exotic scheme rejected on UPDATE as well.
SELECT throws_ok(
  $$UPDATE channel_npcs SET avatar_url = 'javascript:alert(1)'
    WHERE channel_id = '00000000-0000-0000-0000-000000042911' AND name = 'Owl'$$,
  NULL,
  'javascript: npc avatar rejected on update'
);
SELECT lives_ok(
  $$UPDATE channel_npcs SET avatar_url = ' https://example.com/owl2.png'
    WHERE channel_id = '00000000-0000-0000-0000-000000042911' AND name = 'Owl'$$,
  'whitespace-prefixed https npc avatar passes on update'
);

-- ===== send_message RPC path (roster insert + message snapshot) =====

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042901', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000042901","role":"authenticated"}', true);

-- New NPC with an evil client-supplied portrait: the roster insert the RPC
-- performs is rejected, so the whole RPC fails.
SELECT throws_ok(
  $$SELECT send_message('00000000-0000-0000-0000-000000042911', 'Boo',
    'npc', NULL, NULL, NULL, 'Ghost', 'javascript:alert(1)')$$,
  'URLs must start with http:// or https://',
  'send_message with evil npc avatar fails'
);

-- Nothing leaked into the roster.
SELECT is(
  (SELECT count(*) FROM channel_npcs
   WHERE channel_id = '00000000-0000-0000-0000-000000042911' AND name = 'Ghost'),
  0::bigint,
  'failed rpc leaves no roster row'
);

-- Legit portrait flows through roster + message snapshot untouched.
SELECT lives_ok(
  $$SELECT send_message('00000000-0000-0000-0000-000000042911', 'Hoot',
    'npc', NULL, NULL, NULL, 'Owl2', 'https://example.com/owl2.png')$$,
  'send_message with https npc avatar succeeds'
);
SELECT is(
  (SELECT avatar_url FROM channel_npcs
   WHERE channel_id = '00000000-0000-0000-0000-000000042911' AND name = 'Owl2'),
  'https://example.com/owl2.png',
  'roster row keeps the https portrait'
);

-- ===== messages.npc_avatar_url =====

SELECT throws_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, npc_name, npc_avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', '00000000-0000-0000-0000-000000042901',
            'npc', 'hiss', 'Serpent', 'data:image/svg+xml;base64,AAAA')$$,
  'URLs must start with http:// or https://',
  'data: npc message avatar is rejected'
);
SELECT lives_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, npc_name, npc_avatar_url)
    VALUES ('00000000-0000-0000-0000-000000042911', '00000000-0000-0000-0000-000000042901',
            'npc', 'blink', 'Wisp', '00000000-0000-0000-0000-000000042911/npc/wisp.png')$$,
  'relative npc message avatar passes'
);

-- ===== grant-sweep invariant =====

SELECT is(has_function_privilege('anon', 'public.enforce_npc_url_scheme()', 'EXECUTE'), false,
  'anon cannot call enforce_npc_url_scheme');
SELECT is(has_function_privilege('authenticated', 'public.enforce_npc_url_scheme()', 'EXECUTE'), false,
  'authenticated cannot call enforce_npc_url_scheme');
SELECT is(has_function_privilege('service_role', 'public.enforce_npc_url_scheme()', 'EXECUTE'), false,
  'service_role cannot call enforce_npc_url_scheme');

SELECT * FROM finish();
ROLLBACK;
