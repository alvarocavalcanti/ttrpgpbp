-- #674 Phase 4b: admin_list_channels exposes the takedown marker.
--
-- Without it the console sees only join_mode = 'invite' after an admin takedown,
-- so a taken-down listing is indistinguishable from an ordinary private channel
-- and admin_restore_channel_listing has no reachable UI.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

-- ==========================================
-- Fixtures (owner: bypasses RLS)
-- ==========================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000070a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm679@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000070a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin679@test.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000070a02';

INSERT INTO channels (id, name, gm_id, invite_code, join_mode, description, constraints)
VALUES ('00000000-0000-0000-0000-000000070b01', 'Listed Game', '00000000-0000-0000-0000-000000070a01', 'a0679001', 'approval', 'A weekly campaign.', 'Be kind.');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000070a02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000070a02","role":"authenticated"}', true);

-- ==========================================
-- 1. The marker round-trips
-- ==========================================

SELECT is(
  (SELECT listing_takedown_at FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000070b01'),
  NULL,
  'A live listing carries no takedown marker'
);

-- The console shows the copy so a listing report can be judged without joining.
SELECT is(
  (SELECT description FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000070b01'),
  'A weekly campaign.',
  'The listing copy is projected for the admin console'
);

SELECT lives_ok(
  $$SELECT admin_takedown_channel('00000000-0000-0000-0000-000000070b01', 'spam')$$,
  'An admin can take a listing down'
);

SELECT isnt(
  (SELECT listing_takedown_at FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000070b01'),
  NULL,
  'The console can see that the listing was taken down, not merely delisted'
);

-- The copy survives a takedown, so a report can still be judged afterwards.
SELECT is(
  (SELECT constraints FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000070b01'),
  'Be kind.',
  'The listing copy survives a takedown'
);

SELECT lives_ok(
  $$SELECT admin_restore_channel_listing('00000000-0000-0000-0000-000000070b01')$$,
  'An admin can restore a taken-down listing'
);

SELECT is(
  (SELECT listing_takedown_at FROM admin_list_channels() WHERE id = '00000000-0000-0000-0000-000000070b01'),
  NULL,
  'Restore clears the marker, so the listing reads as private again'
);

SELECT * FROM finish();
ROLLBACK;
