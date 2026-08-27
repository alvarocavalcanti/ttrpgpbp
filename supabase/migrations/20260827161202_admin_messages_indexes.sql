-- Admin messaging hot paths: the thread list is ordered by last activity
-- newest-first with an id tie-breaker (the composite cursor), and a thread's
-- messages are read by thread_id + created_at.
CREATE INDEX IF NOT EXISTS idx_admin_threads_last_message_at_id_desc ON public.admin_threads(last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_messages_thread_id_created_at ON public.admin_messages(thread_id, created_at);