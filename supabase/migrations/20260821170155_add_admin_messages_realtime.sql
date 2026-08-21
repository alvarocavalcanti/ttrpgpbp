-- Add admin communication tables to realtime publication so auto-reload and unread badge updates work
ALTER PUBLICATION supabase_realtime ADD TABLE admin_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_thread_reads;
