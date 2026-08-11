-- #57: Player AFK / absence flag.
-- #58: Safety tools (Lines & Veils, X-Card).

-- --- AFK status ---
-- Self-set by the player via their member menu. RLS already lets users update
-- their own channel_members row, and "it's your turn" pushes are suppressed
-- for away members in the push-notifications edge function.
ALTER TABLE channel_members
  ADD COLUMN is_away BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN away_message TEXT;

-- --- Safety tools ---

-- Optional shared link (e.g. a Google Doc), shown in the sidebar like the
-- other URL fields. GM-editable via the existing "GM can update channels" policy.
ALTER TABLE channels
  ADD COLUMN safety_tools_url TEXT;

-- Lines & Veils content, one row per channel. Persistent, readable by all
-- members, editable by the GM.
CREATE TABLE channel_safety_tools (
  channel_id UUID PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  lines TEXT NOT NULL DEFAULT '',
  veils TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE channel_safety_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Safety tools viewable by channel members"
  ON channel_safety_tools FOR SELECT USING (is_channel_member(channel_id));

CREATE POLICY "GM can create safety tools"
  ON channel_safety_tools FOR INSERT WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM can update safety tools"
  ON channel_safety_tools FOR UPDATE USING (is_channel_gm(channel_id));

-- X-Card events: anonymous by design (no user_id) so players can flag a scene
-- without revealing who pressed it. The GM gets an instant in-app alert via
-- realtime.
CREATE TABLE safety_card_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX safety_card_events_channel_idx ON safety_card_events(channel_id);

ALTER TABLE safety_card_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can trigger X-Card"
  ON safety_card_events FOR INSERT WITH CHECK (is_channel_member(channel_id));

-- Only the GM sees X-Card events, keeping the trigger anonymous to other players.
CREATE POLICY "GM can view X-Card events"
  ON safety_card_events FOR SELECT USING (is_channel_gm(channel_id));

ALTER TABLE safety_card_events REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE safety_card_events;
