-- Fix X-Card realtime delivery to the GM.
-- The original SELECT policy used is_channel_gm(), a SECURITY DEFINER function;
-- Supabase Realtime did not deliver INSERT events to the GM through it. Switch
-- to is_channel_member() (the same pattern message_reactions uses, which works).
-- Rows carry no user_id, so member-wide SELECT leaks nothing; the client only
-- surfaces the alert for the GM.
DROP POLICY "GM can view X-Card events" ON safety_card_events;

CREATE POLICY "Members can view X-Card events"
  ON safety_card_events FOR SELECT USING (is_channel_member(channel_id));
