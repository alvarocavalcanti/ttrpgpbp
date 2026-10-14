-- #621 follow-up (from the Phase 2 review): the messages INSERT backstop only
-- gated `type`, so a non-GM could set `npc_name` / `npc_avatar_url` on a
-- `type='regular'` row and be rendered as that NPC. The snapshot fields are now
-- GM-only, and only on an `npc` row. The command RPC (send_message) inserts as
-- the owner and bypasses RLS, so it is unaffected.
--
-- Policy-only change: generated types are byte-identical.

-- Latest prior text: 20261014140804_sub_channels.sql.
DROP POLICY IF EXISTS "Members can insert messages" ON messages;

CREATE POLICY "Members can insert messages"
  ON messages FOR INSERT WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_id AND c.is_archived
    )
    AND is_channel_member(channel_id)
    AND sender_id = auth.uid()
    AND type IN ('regular', 'scene', 'npc')
    AND (type NOT IN ('scene', 'npc') OR is_channel_gm(channel_id))
    AND (
      (npc_name IS NULL AND npc_avatar_url IS NULL)
      OR (type = 'npc' AND is_channel_gm(channel_id))
    )
    AND (
      sub_channel_id IS NULL
      OR EXISTS (
        SELECT 1 FROM sub_channels sc
        WHERE sc.id = sub_channel_id AND sc.channel_id = messages.channel_id
      )
    )
    AND (
      reply_to IS NULL
      OR EXISTS (
        SELECT 1 FROM messages m
        WHERE m.id = reply_to AND m.channel_id = messages.channel_id AND NOT m.is_deleted
      )
    )
    AND (
      whisper_to IS NULL
      OR EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = messages.channel_id AND cm.user_id = whisper_to AND NOT cm.is_blocked
      )
    )
  );
