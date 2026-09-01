-- Issue #337 residual: gm_id transfer guard.
--
-- The channels UPDATE RLS allowed the current GM to reassign gm_id to any
-- profile (including a non-member), with no trigger guard. Audit decision:
-- guard it. Rules for a gm_id change on UPDATE:
--   * clearing gm_id (IS NULL) is allowed (account deletion / unclaim);
--   * setting gm_id on an orphan (OLD IS NULL) is allowed (admin_claim_channel
--     is admin-gated and SECURITY DEFINER);
--   * reassigning to a different profile requires the new GM to already be a
--     channel member (handover to a member, not to an arbitrary profile).

-- ==========================================
-- Trigger: validate gm_id transfers
-- ==========================================
CREATE OR REPLACE FUNCTION enforce_gm_transfer_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gm_id IS NOT DISTINCT FROM OLD.gm_id THEN
    RETURN NEW; -- no change
  END IF;

  -- Clearing the GM (orphan) is always allowed.
  IF NEW.gm_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Claiming an orphan is allowed (admin_claim_channel is admin-gated).
  IF OLD.gm_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reassignment: the new GM must already be a channel member.
  IF NOT EXISTS (
    SELECT 1 FROM channel_members m
    WHERE m.channel_id = NEW.id AND m.user_id = NEW.gm_id
  ) THEN
    RAISE EXCEPTION 'New GM must be a channel member';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channels_gm_transfer_validity ON channels;
CREATE TRIGGER channels_gm_transfer_validity
  BEFORE UPDATE OF gm_id ON channels
  FOR EACH ROW EXECUTE FUNCTION enforce_gm_transfer_validity();