-- #768: a room-access change must reach the affected viewer's Lobby.
--
-- The invites table stays off the realtime publication (Postgres Changes does
-- not apply RLS to DELETE events, so a revoked invite would leak its room id and
-- user id to every subscribed client). Both invite RPCs therefore touch the
-- parent channel row, which the Lobby already watches and which only the
-- channel's members can read; a whole-room audience flip does the same. This
-- file pins:
--   * an invite grant/revocation touches the channel row, and a no-op repeat
--     does not (nobody's Lobby is woken for nothing);
--   * an audience change touches it, a rename and a no-op save do not;
--   * the per-viewer RPCs the Lobby refetches with already reflect a grant and a
--     revocation immediately, including the empty state.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(29);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000a301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'access-gm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000a302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'access-p1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000a303', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'access-p2@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-00000000b301', 'Access Grant', '00000000-0000-0000-0000-00000000a301', 'acce0001'),
  ('00000000-0000-0000-0000-00000000b302', 'Access Empty', '00000000-0000-0000-0000-00000000a301', 'acce0002');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at, joined_at)
VALUES
  ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a301', 'GM', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000c302', '00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a302', 'P1', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000c303', '00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a303', 'P2', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000c304', '00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000a302', 'P1', now() - interval '1 hour', now() - interval '2 hours');

INSERT INTO sub_channels (id, channel_id, name, created_by, visibility)
VALUES
  ('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000b301', 'Private', '00000000-0000-0000-0000-00000000a301', 'private'),
  ('00000000-0000-0000-0000-00000000d302', '00000000-0000-0000-0000-00000000b302', 'Secret', '00000000-0000-0000-0000-00000000a301', 'private');

-- Another member is already invited, so the re-add and no-op cases below have a
-- row to collide with.
INSERT INTO sub_channel_members (sub_channel_id, user_id, added_by)
VALUES ('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000a303', '00000000-0000-0000-0000-00000000a301');

INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id, created_at)
VALUES
  ('00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a301', 'regular', 'main-old', NULL, now() - interval '50 minutes'),
  ('00000000-0000-0000-0000-00000000e302', '00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a301', 'regular', 'secret-new', '00000000-0000-0000-0000-00000000d301', now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-00000000e303', '00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000a301', 'regular', 'only-visible-when-invited', '00000000-0000-0000-0000-00000000d302', now() - interval '20 minutes');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- ---- before the grant -------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a302","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  'GM: main-old',
  'the private room preview is invisible before the grant'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM get_user_channels_unread('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  1::BIGINT,
  'the private room unread is not counted before the grant'
);

SELECT is(
  (SELECT last_message_at FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b302'),
  NULL::timestamptz,
  'a channel whose only history is in a room the viewer cannot see has no preview'
);

-- ---- the GM grants the player access to the private room --------------------
SELECT set_config('test.stamp_before', (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'), true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a301","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT add_sub_channel_member('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000a302')$$,
  'the GM can grant room access to another member'
);

SELECT isnt(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.stamp_before'),
  'the grant touches the channel row so the invited viewer hears about it'
);

-- Re-adding the same invite changes nothing and must not wake the channel.
SELECT set_config('test.noop_before', (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'), true);
SELECT lives_ok(
  $$SELECT add_sub_channel_member('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000a302')$$,
  're-adding an existing invite is harmless'
);

SELECT is(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.noop_before'),
  'a repeat invite does not touch the channel row'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a302","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  'Private · GM: secret-new',
  'the granted viewer sees the newly visible room message'
);

SELECT is(
  (SELECT last_message_at FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  (SELECT created_at FROM messages WHERE id = '00000000-0000-0000-0000-00000000e302'),
  'the granted viewer activity ordering follows the room message'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM get_user_channels_unread('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  2::BIGINT,
  'the granted viewer is charged the new room unread'
);

-- ---- the GM revokes it ------------------------------------------------------
SELECT set_config('test.stamp_before', (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'), true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a301","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT remove_sub_channel_member('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000a302')$$,
  'the GM can revoke room access'
);

SELECT isnt(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.stamp_before'),
  'the revocation touches the channel row so the affected viewer hears about it'
);

-- Removing an invite the player does not have is a no-op.
SELECT set_config('test.noop_before', (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'), true);
SELECT lives_ok(
  $$SELECT remove_sub_channel_member('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000a302')$$,
  'removing a missing invite is harmless'
);

SELECT is(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.noop_before'),
  'a repeat revocation does not touch the channel row'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a302","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  'GM: main-old',
  'a revoked viewer falls back to the latest remaining visible message'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM get_user_channels_unread('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b301'),
  1::BIGINT,
  'a revoked viewer stops being charged the room unread'
);

SELECT is(
  (SELECT last_message_preview FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b302'),
  NULL::text,
  'a channel whose only history is in a room the viewer cannot see has no preview'
);

-- The empty state after a real revocation: b302 has history ONLY in d302, so
-- granting access must surface a preview and revoking it must clear that
-- preview again (not merely leave a channel that was always empty).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a301","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT add_sub_channel_member('00000000-0000-0000-0000-00000000d302', '00000000-0000-0000-0000-00000000a302')$$,
  'the GM can grant access to a second private room'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a302","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b302'),
  'Secret · only-visible-when-invited',
  'the granted viewer gets a preview for a channel that had nothing visible'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM get_user_channels_unread('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b302'),
  1::BIGINT,
  'the granted viewer is charged that channel''s room unread'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a301","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT remove_sub_channel_member('00000000-0000-0000-0000-00000000d302', '00000000-0000-0000-0000-00000000a302')$$,
  'the GM can revoke that second invitation'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a302","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM get_user_channel_previews('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b302'),
  NULL::text,
  'revoking the only visible room clears the preview back to the empty state'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM get_user_channels_unread('00000000-0000-0000-0000-00000000a302')
     WHERE channel_id = '00000000-0000-0000-0000-00000000b302'),
  0::BIGINT,
  'revoking the only visible room clears its unread count'
);

-- ---- a whole-room audience flip reaches the channel row ---------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a301","role":"authenticated"}', true);
SELECT set_config('test.stamp_before', (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'), true);
SELECT lives_ok(
  $$SELECT set_sub_channel_visibility('00000000-0000-0000-0000-00000000d301', 'gm')$$,
  'the GM can flip a room to GM-only'
);

SELECT isnt(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.stamp_before'),
  'an audience change touches the channel row so a viewer who lost access is reached'
);

SELECT set_config('test.rename_before', (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'), true);
SELECT lives_ok(
  $$SELECT update_sub_channel('00000000-0000-0000-0000-00000000d301', 'Renamed')$$,
  'the GM can rename a room'
);

SELECT is(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.rename_before'),
  'a rename does not touch the channel row'
);

-- Re-saving the audience it already has must not wake every Lobby either.
SELECT lives_ok(
  $$SELECT set_sub_channel_visibility('00000000-0000-0000-0000-00000000d301', 'gm')$$,
  'the GM can re-save the same audience'
);

SELECT is(
  (SELECT updated_at::text FROM channels WHERE id = '00000000-0000-0000-0000-00000000b301'),
  current_setting('test.rename_before'),
  'an unchanged audience does not touch the channel row'
);

SELECT * FROM finish();
ROLLBACK;
