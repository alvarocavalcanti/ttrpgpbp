-- #674 Phase 3b: the join request push triggers.
--
-- Held in their own migration from the handler they call
-- (20261016100957_push_join_request_notifications.sql) so the pre-commit types
-- guard can see that neither file can change the generated types: the handler is
-- a trigger function (absent from the generated types) and these CREATE TRIGGER
-- statements are not schema-shape statements. Together in one file the guard
-- treats it as needing a regenerated src/types/database.ts, which is
-- byte-identical and therefore impossible to stage.

CREATE TRIGGER on_join_request_received_push
AFTER INSERT ON public.channel_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_join_request_notification();

-- Only a real decision fires: withdraw_join_request sets 'withdrawn' (nothing to
-- tell anyone) and a no-op update must not re-notify.
CREATE TRIGGER on_join_request_decided_push
AFTER UPDATE OF status ON public.channel_join_requests
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
EXECUTE FUNCTION public.handle_join_request_notification();
