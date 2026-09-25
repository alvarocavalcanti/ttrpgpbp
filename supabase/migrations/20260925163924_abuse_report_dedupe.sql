-- Security fix (2026-09-25 final audit, P2): abuse reports had no
-- de-duplication, so a channel member could re-submit the same report
-- repeatedly, flooding the admin System thread and its push notifications —
-- the very inbox that carries safety alerts.
--
-- One report per (reporter, message). message_id is nullable (reports target a
-- message in practice), so the constraint is partial.

CREATE UNIQUE INDEX abuse_reports_reporter_message_unique
  ON public.abuse_reports (reporter_id, message_id)
  WHERE message_id IS NOT NULL;
