-- Room-aware channel unread + per-viewer Lobby previews.
--
-- Bug: opening a channel (Main) cleared the Lobby pill for every room because
-- the channel count used one channel_members.last_read_at for all messages,
-- while the room dots used sub_channel_reads. And the Lobby preview read the
-- channel-wide channels.last_message_preview, which is deliberately NULL for
-- whispers and restricted rooms, so a channel full of readable messages could
-- render "No messages yet".
--
-- This file pins:
--   * channel unread = Main (main_last_read_at) + every room the caller can see
--     (sub_channel_reads, joined_at fallback), identical in the authenticated
--     and the service_role batch path;
--   * reading Main clears only Main; reading a room clears only that room;
--   * get_user_channel_previews returns the last message the VIEWER can see,
--     read or not.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(31);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-gm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-p1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-out@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unread-join@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-00000000f101', 'Unread Rooms', '00000000-0000-0000-0000-00000000e101', 'aabbcc11'),
  ('00000000-0000-0000-0000-00000000f102', 'Hidden Only', '00000000-0000-0000-0000-00000000e101', 'aabbcc12'),
  ('00000000-0000-0000-0000-00000000f103', 'Joiner', '00000000-0000-0000-0000-00000000e101', 'aabbcc13');

-- e101 GM, e102 invited to the private room, e103 plain member (no private/gm
-- access). All three read this channel an hour ago. The BEFORE INSERT trigger
-- copies last_read_at into main_last_read_at, so these rows do not exercise the
-- COALESCE fallback — the explicit NULL case below does.
INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at, joined_at)
VALUES
  ('00000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'GM', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000002102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e102', 'P', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000002103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e103', 'Out', now() - interval '1 hour', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000002104', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e103', 'Out', now() - interval '1 hour', now() - interval '2 hours'),
  -- Joiner: no sub_channel_reads row anywhere; the room history predates them.
  ('00000000-0000-0000-0000-000000002105', '00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000e104', 'New', now() - interval '1 minute', now() - interval '1 minute');

INSERT INTO sub_channels (id, channel_id, name, created_by, visibility)
VALUES
  ('00000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-00000000f101', 'Battle', '00000000-0000-0000-0000-00000000e101', 'all'),
  ('00000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-00000000f101', 'Private', '00000000-0000-0000-0000-00000000e101', 'private'),
  ('00000000-0000-0000-0000-000000003103', '00000000-0000-0000-0000-00000000f101', 'GMOps', '00000000-0000-0000-0000-00000000e101', 'gm'),
  ('00000000-0000-0000-0000-000000003104', '00000000-0000-0000-0000-00000000f102', 'Secret', '00000000-0000-0000-0000-00000000e101', 'gm'),
  ('00000000-0000-0000-0000-000000003105', '00000000-0000-0000-0000-00000000f103', 'Old', '00000000-0000-0000-0000-00000000e101', 'all');

INSERT INTO sub_channel_members (sub_channel_id, user_id, added_by)
VALUES ('00000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000e101');

-- Explicit timestamps so "latest message the viewer can see" is deterministic.
-- Senders alternate so each actor has unread from someone else in Main and in
-- at least one room.
INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id, whisper_to, created_at)
VALUES
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'regular', 'main-hello', NULL, NULL, now() - interval '40 minutes'),
  ('00000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e102', 'regular', 'battle-hello', '00000000-0000-0000-0000-000000003101', NULL, now() - interval '35 minutes'),
  ('00000000-0000-0000-0000-000000004103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'regular', 'private-secret', '00000000-0000-0000-0000-000000003102', NULL, now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-000000004104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e102', 'regular', 'gm-ops', '00000000-0000-0000-0000-000000003103', NULL, now() - interval '25 minutes'),
  -- Play-by-post whispers both ways: the player's one is older, so the GM's
  -- remaining "latest" after the deletions below exercises the GM clause.
  ('00000000-0000-0000-0000-000000004105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e102', 'regular', 'gm-only-note', NULL, '00000000-0000-0000-0000-00000000e101', now() - interval '22 minutes'),
  ('00000000-0000-0000-0000-000000004106', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'regular', 'whisper-note', NULL, '00000000-0000-0000-0000-00000000e102', now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-000000004107', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e101', 'regular', 'gm-only-history', '00000000-0000-0000-0000-000000003104', NULL, now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000004108', '00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000e101', 'regular', 'before-join', '00000000-0000-0000-0000-000000003105', NULL, now() - interval '10 minutes');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e102', true);

-- ---- channel unread = Main + every visible room -----------------------------
-- e102: Main 2 (m1 + the whisper they received), Private 1 (m3), Battle 0 (own
-- message), GMOps 0 (own + not visible).
SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e102')),
  3::BIGINT,
  'channel unread sums Main plus every room the member can see'
);

SELECT is(
  (SELECT unread_count FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101') WHERE sub_channel_id IS NULL),
  2::BIGINT,
  'Main counts its own messages only'
);

SELECT is(
  (SELECT unread_count FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101') WHERE sub_channel_id = '00000000-0000-0000-0000-000000003102'),
  1::BIGINT,
  'an invited member counts the private room'
);

SELECT is(
  (SELECT COUNT(*) FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101')),
  3::BIGINT,
  'rooms the member cannot see are not returned at all'
);

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e101', true);

-- GM: Main 1 (the whisper sent to them), Battle 1, GMOps 1, Private 0 (own).
SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e101')),
  3::BIGINT,
  'the GM counts every room they can see and the whispers sent to them'
);

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e103', true);

-- Outsider: Main 1 (no whisper for them), Battle 1, no private/gm room.
SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e103')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  2::BIGINT,
  'a plain member is not charged for rooms they cannot open'
);

-- A membership inserted without the column starts Main read where its read
-- state starts (trigger), so the shared last_read_at never leaks into Main.
SELECT is(
  (SELECT main_last_read_at FROM channel_members WHERE id = '00000000-0000-0000-0000-000000002103'),
  (SELECT last_read_at FROM channel_members WHERE id = '00000000-0000-0000-0000-000000002103'),
  'a new membership backfills Main from its own last_read_at'
);

-- The readers keep a COALESCE fallback for a row that bypasses the trigger
-- (a manual repair, say): a NULL Main mark must behave like last_read_at.
RESET ROLE;
UPDATE channel_members SET main_last_read_at = NULL WHERE id = '00000000-0000-0000-0000-000000002103';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e103', true);

SELECT is(
  (SELECT unread_count FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101') WHERE sub_channel_id IS NULL),
  1::BIGINT,
  'a NULL Main mark falls back to last_read_at'
);


SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', NULL, true);

SELECT set_eq(
  $$SELECT user_id::text || ':' || unread_count FROM public.get_unread_totals(
    ARRAY[
      '00000000-0000-0000-0000-00000000e101'::UUID,
      '00000000-0000-0000-0000-00000000e102'::UUID,
      '00000000-0000-0000-0000-00000000e103'::UUID
    ]
  )$$,
  ARRAY[
    '00000000-0000-0000-0000-00000000e101:3',
    '00000000-0000-0000-0000-00000000e102:3',
    '00000000-0000-0000-0000-00000000e103:2'
  ],
  'the push batch totals agree with the authenticated channel totals'
);

-- A cached bundle calls mark_channel_read with one argument; the default must
-- still clear Main or its badge would stick forever after the upgrade.
SELECT lives_ok(
  $$SELECT public.mark_channel_read('00000000-0000-0000-0000-00000000f101')$$,
  'a one-argument read still resolves'
);

SELECT is(
  (SELECT unread_count FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101') WHERE sub_channel_id IS NULL),
  0::BIGINT,
  'a one-argument read marks Main read'
);

-- ---- reading Main clears only Main ----------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e102', true);

SELECT lives_ok(
  $$SELECT public.mark_channel_read('00000000-0000-0000-0000-00000000f101', true)$$,
  'reading Main marks it read'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e102')),
  1::BIGINT,
  'reading Main leaves the unread room in the channel count (regression)'
);

SELECT is(
  (SELECT unread_count FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101') WHERE sub_channel_id IS NULL),
  0::BIGINT,
  'reading Main clears the Main group'
);

-- ---- reading a room clears only that room ---------------------------------
SELECT lives_ok(
  $$SELECT public.mark_sub_channel_read('00000000-0000-0000-0000-000000003102')$$,
  'opening a room marks it read'
);

SELECT is(
  (SELECT unread_count FROM public.get_channel_room_unread('00000000-0000-0000-0000-00000000f101') WHERE sub_channel_id = '00000000-0000-0000-0000-000000003102'),
  0::BIGINT,
  'the room dot clears'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e102')),
  0::BIGINT,
  'the channel count drops by exactly that room'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', NULL, true);

SELECT is(
  (SELECT unread_count FROM public.get_unread_totals(ARRAY['00000000-0000-0000-0000-00000000e102'::UUID])),
  0::BIGINT,
  'the batch total follows the same per-room marks'
);

-- ---- a joiner starts caught up on room history -----------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e104","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e104', true);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e104')),
  0::BIGINT,
  'a member joining after the room history starts caught up, not at -infinity'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT public.mark_channel_read('00000000-0000-0000-0000-00000000f101', true)$$,
  'a second Main read is harmless'
);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e103')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  1::BIGINT,
  'a later Main read still leaves the room unread'
);

-- ---- per-viewer previews --------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated"}', true);

-- e102's latest readable message is the GM's whisper to them (Main, no prefix).
SELECT is(
  (SELECT last_message_preview FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e102')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  'GM: whisper-note',
  'the preview shows the whisper this member received'
);

SELECT is(
  (SELECT last_message_at FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e102')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  (SELECT created_at FROM messages WHERE id = '00000000-0000-0000-0000-000000004106'),
  'the preview timestamp is the last message the member can see'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e101')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  'GM: whisper-note',
  'the sender still sees their own last message'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated"}', true);

-- Outsider's latest readable message is the all-visible room post; no whisper,
-- no private room, no gm room, and the room name is part of the preview.
SELECT is(
  (SELECT last_message_preview FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e103')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  'Battle · P: battle-hello',
  'the preview skips private rooms, gm rooms and other people''s whispers'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e102')$$,
  'P0001', NULL,
  'previews are scoped to the authenticated user'
);

-- A channel whose only history is in a room the member cannot see has no
-- preview at all — the Lobby says "No messages yet", which is true for them.
SELECT is(
  (SELECT COUNT(*) FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e103')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f102'
       AND last_message_at IS NULL
       AND last_message_preview IS NULL),
  1::BIGINT,
  'no readable message yields a row with no preview'
);

-- Deleting the latest whisper falls back to the previous one, and proves the GM
-- clause on the preview path (the player's whisper to the GM becomes latest).
RESET ROLE;
UPDATE messages SET is_deleted = true WHERE id = '00000000-0000-0000-0000-000000004106';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e101')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  'P: gm-only-note',
  'the GM sees the whisper sent to them once the newer one is deleted'
);

-- Deleting that whisper too surfaces the private room the member was invited to.
RESET ROLE;
UPDATE messages SET is_deleted = true WHERE id = '00000000-0000-0000-0000-000000004105';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e102')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  'Private · GM: private-secret',
  'a deleted latest message falls back to the previous visible one'
);

-- A message posted after the join is unread again.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', NULL, true);
SELECT set_config('request.jwt.claims', NULL, true);
INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000e101', 'regular', 'after-join', '00000000-0000-0000-0000-000000003105');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e104","role":"authenticated"}', true);

SELECT is(
  (SELECT SUM(unread_count)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-00000000e104')),
  1::BIGINT,
  'a room message posted after the join is unread'
);

-- Two messages sharing a timestamp: the preview picks the same one the chat
-- list does (created_at DESC, id DESC), not a plan-dependent row.
RESET ROLE;
INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id, created_at)
VALUES
  ('00000000-0000-0000-0000-000000004109', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'regular', 'tie-lower', NULL, now() - interval '5 minutes'),
  ('00000000-0000-0000-0000-000000004110', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'regular', 'tie-higher', NULL, now() - interval '5 minutes');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated"}', true);

SELECT is(
  (SELECT last_message_preview FROM public.get_user_channel_previews('00000000-0000-0000-0000-00000000e103')
     WHERE channel_id = '00000000-0000-0000-0000-00000000f101'),
  'GM: tie-higher',
  'tied timestamps break by id, matching the chat order'
);

SELECT * FROM finish();
ROLLBACK;
