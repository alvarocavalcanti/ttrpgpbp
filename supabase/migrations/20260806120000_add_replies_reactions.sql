-- #46: Reply/quote + emoji reactions + mention support

-- Reply support: messages can point at another message in the same channel.
ALTER TABLE messages
  ADD COLUMN reply_to UUID REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX messages_reply_to_idx ON messages(reply_to) WHERE reply_to IS NOT NULL;

-- Message reactions (emoji).
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX message_reactions_channel_idx ON message_reactions(channel_id);

-- Realtime DELETE events must carry the full row so clients can update
-- aggregated counts (default replica identity only sends the primary key).
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions viewable by channel members"
  ON message_reactions FOR SELECT USING (
    is_channel_member(channel_id)
  );

CREATE POLICY "Users can add their own reactions"
  ON message_reactions FOR INSERT WITH CHECK (
    is_channel_member(channel_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can remove their own reactions"
  ON message_reactions FOR DELETE USING (
    user_id = auth.uid()
  );

ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
