-- #411: X-Card alerts were live-only (realtime INSERT subscription), so a GM
-- opening the channel after a flag saw nothing, and dismissal was client-local
-- (a reload cleared the alert minutes after a live flag). Add a resolved_at
-- marker so the GM's mount-time catch-up can find unhandled events and
-- dismissal can persist across reloads.
ALTER TABLE safety_card_events
  ADD COLUMN resolved_at TIMESTAMPTZ;

-- Only the GM may resolve X-Card events; players keep INSERT-only access, so
-- the trigger stays anonymous.
CREATE POLICY "GM can resolve X-Card events"
  ON safety_card_events FOR UPDATE
  USING (is_channel_gm(channel_id))
  WITH CHECK (is_channel_gm(channel_id));

-- A flagger could otherwise INSERT a pre-resolved event (resolved_at set),
-- which the GM catch-up (resolved_at IS NULL) would never surface. Members
-- may only raise unresolved flags; resolution stays GM-only via the UPDATE
-- policy above.
DROP POLICY "Members can trigger X-Card" ON safety_card_events;
CREATE POLICY "Members can trigger X-Card"
  ON safety_card_events FOR INSERT
  WITH CHECK (is_channel_member(channel_id) AND resolved_at IS NULL);
