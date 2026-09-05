-- Add composite index for the reconnect reconcile query
-- (messages reconciled on realtime re-subscribe and visibilitychange:
--  WHERE channel_id = ? AND (updated_at > ? OR (updated_at = ? AND id > ?))
--  ORDER BY updated_at, id LIMIT 50)

CREATE INDEX IF NOT EXISTS idx_messages_channel_updated_at ON public.messages(channel_id, updated_at DESC, id DESC);
