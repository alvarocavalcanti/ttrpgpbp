-- #63: GM can send messages as NPCs with a name and portrait.
--
-- channel_npcs stores the per-channel NPC roster (name + portrait). Messages
-- get snapshot columns (npc_name / npc_avatar_url) so past messages keep the
-- name/portrait they were sent with even if the NPC is later renamed/repictured.

CREATE TABLE channel_npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, name)
);

ALTER TABLE channel_npcs ENABLE ROW LEVEL SECURITY;

-- Only the channel GM can manage NPCs (create, read, update portrait, delete).
CREATE POLICY "GM can manage NPCs in their channels"
  ON channel_npcs FOR ALL USING (is_channel_gm(channel_id)) WITH CHECK (is_channel_gm(channel_id));

-- Snapshot columns on the message row. sender_id stays the GM's id; NPC identity
-- lives here so past messages are stable across NPC renames.
ALTER TABLE messages
  ADD COLUMN npc_name TEXT,
  ADD COLUMN npc_avatar_url TEXT;

-- Add 'npc' to the message type check.
ALTER TABLE messages
  DROP CONSTRAINT messages_type_check,
  ADD CONSTRAINT messages_type_check
    CHECK (type IN ('regular', 'scene', 'dice_roll', 'system', 'npc'));

-- Only the channel GM can post NPC messages; everyone else keeps the existing
-- member + own-sender rule.
DROP POLICY IF EXISTS "Members can insert messages" ON messages;

CREATE POLICY "Members can insert messages"
  ON messages FOR INSERT WITH CHECK (
    is_channel_member(channel_id)
    AND sender_id = auth.uid()
    AND (type <> 'npc' OR is_channel_gm(channel_id))
  );
