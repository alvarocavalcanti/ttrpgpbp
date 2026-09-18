-- Review fix N4: the messages index must be built concurrently.
--
-- A plain CREATE INDEX takes an ACCESS EXCLUSIVE lock on the table, blocking
-- writes for the duration. On the hot messages table the house convention is a
-- dedicated single-statement CONCURRENTLY migration (see 20260905175441 and
-- 20260908170031) so `supabase db push` against production never stalls play.
--
-- Serves admin_list_user_messages: WHERE sender_id = ? ORDER BY created_at DESC
-- including soft-deleted rows, which the partial idx_messages_sender_active
-- (sender_id) WHERE NOT is_deleted cannot.

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_created_idx ON public.messages(sender_id, created_at DESC);
