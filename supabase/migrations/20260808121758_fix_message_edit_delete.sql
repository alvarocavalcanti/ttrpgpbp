-- #92: allow editing/soft-deleting messages and managing scene messages.
--
-- Before this change, soft-deleting a message ran UPDATE messages SET
-- is_deleted = true, but the only UPDATE policy ("Senders can edit their own
-- messages within 15 mins") required is_deleted = false on the new row (Postgres
-- reuses the USING expression as WITH CHECK when none is given), so the delete
-- was rejected with 42501 "new row violates row-level security policy".
--
-- It also locked scene messages (type = 'scene') out of editing/deleting
-- entirely because the policy only matched type = 'regular'.

DROP POLICY IF EXISTS "Senders can edit their own messages within 15 mins" ON messages;

-- Sender can edit the content of their own regular messages within 15 minutes.
-- WITH CHECK keeps the row owned by the sender without re-requiring
-- is_deleted = false on the new row.
CREATE POLICY "Senders can edit their own messages within 15 mins"
  ON messages FOR UPDATE USING (
    sender_id = auth.uid()
    AND type = 'regular'
    AND is_deleted = false
    AND (NOW() - created_at) < INTERVAL '15 minutes'
  ) WITH CHECK (
    sender_id = auth.uid()
    AND is_deleted = false
  );

-- Sender can soft-delete their own messages within 15 minutes. The new row is
-- explicitly is_deleted = true so it no longer violates the edit policy.
CREATE POLICY "Senders can soft-delete their own messages within 15 mins"
  ON messages FOR UPDATE USING (
    sender_id = auth.uid()
    AND is_deleted = false
    AND (NOW() - created_at) < INTERVAL '15 minutes'
  ) WITH CHECK (
    sender_id = auth.uid()
    AND is_deleted = true
  );

-- GM can edit and delete any message in their channel (scene, regular, dice,
-- system). WITH CHECK defaults to USING (is_channel_gm) which already gates on
-- the channel the row belongs to.
CREATE POLICY "GM can manage messages in their channels"
  ON messages FOR UPDATE USING (
    is_channel_gm(channel_id)
  );
