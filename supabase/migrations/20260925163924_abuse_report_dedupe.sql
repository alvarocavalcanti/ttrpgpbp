-- Security fix (2026-09-25 final audit, P2): abuse reports had no
-- de-duplication, so a channel member could re-submit the same report
-- repeatedly, flooding the admin System thread and its push notifications —
-- the very inbox that carries safety alerts.
--
-- One report per (reporter, message). message_id is nullable (reports target a
-- message in practice), so the constraint is partial.

-- The previous schema allowed a reporter to submit the same report repeatedly,
-- so a deployed database may already hold duplicates. Reconcile them before the
-- unique index is created (it would otherwise fail): keep the earliest report
-- per (reporter, message) pair.
DELETE FROM public.abuse_reports a
USING public.abuse_reports b
WHERE a.message_id IS NOT NULL
  AND a.reporter_id = b.reporter_id
  AND a.message_id = b.message_id
  AND a.id <> b.id
  AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX abuse_reports_reporter_message_unique
  ON public.abuse_reports (reporter_id, message_id)
  WHERE message_id IS NOT NULL;
