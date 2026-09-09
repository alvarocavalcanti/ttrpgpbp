-- #467 review fix: the RLS policy only checks reporter_id = auth.uid(), so a
-- malicious client could forge a report against an arbitrary user or attach
-- any message/channel it likes (all three fields are client-supplied; the FKs
-- only verify existence, not consistency). This trigger makes the message row
-- authoritative: it must exist (FK), its channel must be one the reporter is
-- a member of, and channel_id / reported_user_id are derived from it, so any
-- forged mismatch is corrected before the row lands. NPC messages (no real
-- sender) can't be targeted.

CREATE OR REPLACE FUNCTION enforce_abuse_report_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_channel_id UUID;
  msg_sender_id  UUID;
BEGIN
  IF NEW.message_id IS NULL THEN
    -- Member-list style reports (future work) supply their own target; the
    -- FKs plus the INSERT policy remain the only guarantees on that path.
    RETURN NEW;
  END IF;

  SELECT channel_id, sender_id
    INTO msg_channel_id, msg_sender_id
    FROM messages
   WHERE id = NEW.message_id;

  -- FK guarantees existence; the INTO above only fails when the message was
  -- deleted between statement steps.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reported message not found.';
  END IF;

  -- Only members of the channel the message lives in may report it.
  IF NOT is_channel_member(msg_channel_id) THEN
    RAISE EXCEPTION 'You can only report messages in channels you belong to.';
  END IF;

  -- No sender = NPC speech; there is no player behind it to report.
  IF msg_sender_id IS NULL THEN
    RAISE EXCEPTION 'NPC messages cannot be reported.';
  END IF;

  NEW.channel_id := msg_channel_id;
  NEW.reported_user_id := msg_sender_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER abuse_reports_integrity
  BEFORE INSERT ON abuse_reports
  FOR EACH ROW
  EXECUTE FUNCTION enforce_abuse_report_integrity();

-- Protect the derivation from later tampering by admin tooling: reporting is
-- append-only, no UPDATE path needs to change these columns anyway (admins
-- resolve reports via the status column only).
CREATE OR REPLACE FUNCTION enforce_abuse_report_immutable_report_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message_id IS DISTINCT FROM OLD.message_id
     OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id THEN
    RAISE EXCEPTION 'Report linkage (reporter/message) cannot be changed.';
  END IF;
  -- Derived columns are equally guarded: admin UPDATEs touch status only.
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.reported_user_id IS DISTINCT FROM OLD.reported_user_id THEN
    RAISE EXCEPTION 'Derived report target (channel/user) cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER abuse_reports_immutable_linkage
  BEFORE UPDATE ON abuse_reports
  FOR EACH ROW
  EXECUTE FUNCTION enforce_abuse_report_immutable_report_target();
