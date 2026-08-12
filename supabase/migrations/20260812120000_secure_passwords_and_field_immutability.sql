-- Audit P0-1/P0-2 (2026-08-12): salt channel access passwords (PBKDF2) and
-- lock identity/routing fields against tampering.

-- ==========================================
-- 1. Salted channel passwords
-- ==========================================

-- Store the per-channel PBKDF2 salt alongside the existing hash. The hash is
-- derived client-side (Web Crypto PBKDF2, 210k iterations); Postgres only
-- stores and compares the derived value, so the salt must be persisted too.
ALTER TABLE channel_secrets ADD COLUMN password_salt TEXT;

-- Reveal the salt for join verification. channel_secrets is GM-only (RLS), so
-- joining users need a SECURITY DEFINER path to read the (non-secret) salt and
-- re-derive the expected hash. Returns NULL for legacy SHA-256 channels that
-- predate salting.
CREATE OR REPLACE FUNCTION get_channel_salt(p_channel_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT password_salt
  FROM channel_secrets
  WHERE channel_id = p_channel_id;
$$;

REVOKE ALL ON FUNCTION get_channel_salt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_channel_salt(UUID) TO authenticated;

-- ==========================================
-- 2. Identity / routing field immutability
-- ==========================================
-- Each trigger only blocks requests that carry an authenticated JWT
-- (auth.uid() IS NOT NULL). Admin/dashboard edits run as the postgres role
-- with no JWT and stay allowed.

-- profiles.server_admin: only settable via Supabase admin, never through the
-- app's self-update path.
CREATE OR REPLACE FUNCTION prevent_server_admin_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.server_admin IS DISTINCT FROM OLD.server_admin THEN
    RAISE EXCEPTION 'server_admin is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_server_admin_immutable
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_server_admin_escalation();

-- channel_members.channel_id / user_id: a member row belongs to exactly one
-- (channel, user); neither may move.
CREATE OR REPLACE FUNCTION prevent_member_identity_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.channel_id IS DISTINCT FROM OLD.channel_id OR
    NEW.user_id IS DISTINCT FROM OLD.user_id
  ) THEN
    RAISE EXCEPTION 'channel_members.channel_id and user_id are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channel_members_identity_immutable
  BEFORE UPDATE ON channel_members
  FOR EACH ROW EXECUTE FUNCTION prevent_member_identity_change();

-- messages routing fields: an update may change content/edit/deletion state
-- but never re-route a message (channel, sender, type, whisper target).
CREATE OR REPLACE FUNCTION prevent_message_routing_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.channel_id IS DISTINCT FROM OLD.channel_id OR
    NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
    NEW.type IS DISTINCT FROM OLD.type OR
    NEW.whisper_to IS DISTINCT FROM OLD.whisper_to
  ) THEN
    RAISE EXCEPTION 'messages routing fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_routing_immutable
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION prevent_message_routing_change();
