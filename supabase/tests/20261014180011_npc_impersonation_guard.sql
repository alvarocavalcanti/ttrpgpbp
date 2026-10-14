-- #621 follow-up: a member could impersonate an NPC by inserting a 'regular'
-- row carrying npc_name / npc_avatar_url (rendered as that NPC regardless of
-- type). The INSERT backstop now rejects NPC snapshot fields from non-GMs, and
-- the capability trigger keys on the snapshot fields too.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000da01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'npcgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000da02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'npcmem@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000db01', 'Impersonate', '00000000-0000-0000-0000-00000000da01', 'dab00001');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da01', 'GM'),
  ('00000000-0000-0000-0000-00000000dd02', '00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da02', 'P1');

-- room_off disables NPCs; room_on leaves them on.
INSERT INTO sub_channels (id, channel_id, name, created_by, allow_npc)
VALUES
  ('00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000db01', 'Open', '00000000-0000-0000-0000-00000000da01', true),
  ('00000000-0000-0000-0000-00000000dc02', '00000000-0000-0000-0000-00000000db01', 'NoNpc', '00000000-0000-0000-0000-00000000da01', false);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- A plain member cannot smuggle NPC fields onto a regular row.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000da02', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da02","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, npc_name) VALUES ('00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da02', 'regular', 'fake', 'Boss')$$,
  '42501', NULL,
  'A member cannot set npc_name on a regular message'
);
SELECT throws_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, npc_avatar_url) VALUES ('00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da02', 'regular', 'fake', 'https://example.com/x.png')$$,
  '42501', NULL,
  'A member cannot set npc_avatar_url on a regular message'
);
SELECT lives_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content) VALUES ('00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da02', 'regular', 'hello')$$,
  'A member can still send a plain message'
);

-- The GM keeps NPC posting, but the capability flag still applies.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000da01', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da01","role":"authenticated"}', true);
SELECT lives_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, npc_name, sub_channel_id) VALUES ('00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da01', 'npc', 'speaks', 'Boss', '00000000-0000-0000-0000-00000000dc01')$$,
  'The GM can post as an NPC where NPCs are on'
);
SELECT throws_ok(
  $$INSERT INTO messages (channel_id, sender_id, type, content, npc_name, sub_channel_id) VALUES ('00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000da01', 'npc', 'speaks', 'Boss', '00000000-0000-0000-0000-00000000dc02')$$,
  'P0001', NULL,
  'Even the GM cannot post as an NPC where NPCs are off'
);

SELECT * FROM finish();
ROLLBACK;
