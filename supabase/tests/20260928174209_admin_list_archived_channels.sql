-- #611: admin_list_archived_channels. Verifies the admin-only guard, the
-- GM name/email join, GM exclusion from the player roster, and the
-- memberless-channel edge: a LEFT JOIN with zero members yields one
-- synthetic all-NULL row, which must aggregate to '{}' (not '{NULL}',
-- which the client's z.array(z.string()) would reject, silently dropping
-- the channel from the admin list).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin611@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm611@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'player611@test.com', '', now(), '{}', '{}', now(), now());

-- handle_new_user creates these profile rows.
UPDATE profiles SET display_name = 'Admin', server_admin = true
WHERE id = '00000000-0000-0000-0000-000000000611';
UPDATE profiles SET display_name = 'Gina GM'
WHERE id = '00000000-0000-0000-0000-000000000612';
UPDATE profiles SET display_name = 'Pete Player'
WHERE id = '00000000-0000-0000-0000-000000000613';

-- A: archived with GM + player. B: archived with zero members (inserted
-- directly: create_channel would auto-add the GM). C: live control.
INSERT INTO channels (id, name, gm_id, game_system, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-000000000614', 'Archived Quest', '00000000-0000-0000-0000-000000000612', 'dnd5e', 'a611a611', true),
  ('00000000-0000-0000-0000-000000000615', 'Empty Archive', '00000000-0000-0000-0000-000000000612', 'none', 'b611b611', true),
  ('00000000-0000-0000-0000-000000000616', 'Live Game', '00000000-0000-0000-0000-000000000612', 'none', 'c611c611', false);

INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000612', 'Gina the DM'),
  ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000613', 'Pete the Rogue');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

-- ===== 1. Non-admin cannot list =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000613');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM admin_list_archived_channels()$$,
  'P0001', 'Not authorized',
  'non-admin cannot list archived channels'
);
RESET ROLE;

-- ===== 2-8. Admin payload =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000611');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_list_archived_channels()),
  2::bigint,
  'admin sees only the two archived channels'
);
SELECT is(
  (SELECT player_characters FROM admin_list_archived_channels()
   WHERE id = '00000000-0000-0000-0000-000000000614'),
  '{Pete the Rogue}'::text[],
  'player roster excludes the GM character'
);
SELECT is(
  (SELECT gm_email FROM admin_list_archived_channels()
   WHERE id = '00000000-0000-0000-0000-000000000614'),
  'gm611@test.com',
  'GM email comes from auth.users'
);
SELECT is(
  (SELECT player_characters FROM admin_list_archived_channels()
   WHERE id = '00000000-0000-0000-0000-000000000615'),
  '{}'::text[],
  'memberless channel aggregates to an empty roster'
);
SELECT is(
  (SELECT NULL = ANY(player_characters) FROM admin_list_archived_channels()
   WHERE id = '00000000-0000-0000-0000-000000000615'),
  false,
  'memberless channel roster has no null entry'
);
SELECT is(
  (SELECT member_count FROM admin_list_archived_channels()
   WHERE id = '00000000-0000-0000-0000-000000000615'),
  0::bigint,
  'memberless channel reports zero members'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM admin_list_archived_channels()
              WHERE id = '00000000-0000-0000-0000-000000000616'),
  'live channels are excluded'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
