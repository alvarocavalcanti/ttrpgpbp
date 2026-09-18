-- Review fixes L6 + L9.
--
-- L6: admin_list_user_messages filters on sender_id and orders by
-- created_at DESC over soft-deleted rows too, so the existing partial
-- idx_messages_sender_active (sender_id) WHERE NOT is_deleted cannot serve it.
-- Add a covering composite index so opening the admin modal does not seq-scan
-- and sort the whole messages table.
CREATE INDEX messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

-- L9: content_hashes.safer_status allowed 'error', but nothing ever writes it —
-- a provider failure throws before any row is inserted, so the value was dead
-- and the docs advertised a state that cannot occur. Narrow the constraint to
-- the statuses that are actually reachable.
ALTER TABLE public.content_hashes
  DROP CONSTRAINT content_hashes_safer_status_check;

ALTER TABLE public.content_hashes
  ADD CONSTRAINT content_hashes_safer_status_check
  CHECK (safer_status IN ('unscanned', 'clear', 'match'));
