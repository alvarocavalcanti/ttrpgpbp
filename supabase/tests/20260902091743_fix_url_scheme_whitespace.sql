-- Follow-up to #364 (CodeRabbit): enforce_url_scheme anchored its scheme
-- regex at character zero, so tab/newline/space-prefixed unsafe schemes
-- (javascript:, data:) passed validation even though WHATWG URL parsing
-- strips that whitespace before the browser interprets the URL — and these
-- channel columns render into href/src attributes.
--
-- Covers: prefixed unsafe schemes rejected, whitespace-stripped relative
-- paths and plain URLs still accepted, stored value unchanged.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000609', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test349gm@example.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id)
VALUES ('00000000-0000-0000-0000-000000000610', 'Channel 349', '00000000-0000-0000-0000-000000000609');

-- ===== 1. Whitespace-prefixed unsafe schemes rejected =====
SELECT throws_ok(
  $$UPDATE channels SET map_url = E'\tjavascript:alert(1)'
    WHERE id = '00000000-0000-0000-0000-000000000610'$$,
  'URLs must start with http:// or https://'
);
SELECT throws_ok(
  $$UPDATE channels SET resources_url = E'\n\rdata:text/html;base64,PHNjcmlwdD4='
    WHERE id = '00000000-0000-0000-0000-000000000610'$$,
  'URLs must start with http:// or https://'
);
SELECT throws_ok(
  $$UPDATE channels SET safety_tools_url = ' javascript:alert(1)'
    WHERE id = '00000000-0000-0000-0000-000000000610'$$,
  'URLs must start with http:// or https://'
);
SELECT throws_ok(
  $$UPDATE channels SET avatar_url = E' \t\njavascript:alert(1) '
    WHERE id = '00000000-0000-0000-0000-000000000610'$$,
  'URLs must start with http:// or https://'
);

-- ===== 2. Legitimate values still accepted =====
SELECT lives_ok(
  $$UPDATE channels SET
      avatar_url = '00000000-0000-0000-0000-000000000610/channel/22222222-2222-2222-2222-222222222222.jpg',
      map_url = 'https://owlbear.rodeo/x',
      resources_url = 'http://example.com/a b',
      safety_tools_url = ' https://example.com/safety '
    WHERE id = '00000000-0000-0000-0000-000000000610'$$,
  'relative storage paths and absolute http(s) URLs still accepted'
);

-- ===== 3. Stored value untouched by validation (no silent rewrite) =====
SELECT is(
  (SELECT safety_tools_url FROM channels WHERE id = '00000000-0000-0000-0000-000000000610'),
  ' https://example.com/safety ',
  'validation normalizes a copy; stored value unchanged'
);

SELECT * FROM finish();
ROLLBACK;
