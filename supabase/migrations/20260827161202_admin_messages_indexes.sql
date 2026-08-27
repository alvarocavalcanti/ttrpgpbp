-- Admin messaging hot paths: thread list is ordered by last activity
-- newest-first, and a thread's messages are read by thread_id + created_at.
CREATE INDEX IF NOT EXISTS idx_admin_threads_last_message_at_desc ON public.admin_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_messages_thread_id_created_at ON public.admin_messages(thread_id, created_at);