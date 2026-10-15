-- #674 Phase 1.5: the anonymous directory projection.
--
-- The public /directory page is the one place a logged-out visitor (or a search
-- engine) may read anything from this database, so the read is reduced to the
-- smallest possible surface:
--
--   * GM-authored name + description only, for non-archived listed channels.
--   * No id, no GM, no game system, no member count, no activity, no messages,
--     no member identities, no invite codes, no secrets.
--   * A role-agnostic projection: it answers the same whether it is called by
--     anon, authenticated, or service_role, so there is no signed-in variant to
--     drift from the public one.
--
-- SECURITY DEFINER means anon needs EXECUTE and nothing else — the channels
-- SELECT policy (and every content policy) stays exactly as it is. This is the
-- repro's stated exception to "anon holds zero content reads and zero function
-- EXECUTE" (20260905141623_sec1_grant_sweep.sql), so it is:
--   * granted to anon in exactly one place (here),
--   * allowlisted by name in the grant-sweep test with an explanatory comment,
--   * covered by its own projection test asserting no other column can leak.
-- Any second anon-granted function must go through the same review; the sweep
-- test fails on it otherwise.

CREATE OR REPLACE FUNCTION public.list_public_channels_anon(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (name TEXT, description TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.name, c.description
  FROM channels c
  WHERE c.join_mode = 'approval'
    AND NOT c.is_archived
  -- Matches list_public_channels and the partial index added in
  -- 20261015105029_public_channels_directory_index.sql.
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  -- A NULL p_limit must not become LIMIT ALL: default to the page size and cap
  -- it, mirroring the signed-in discovery RPC.
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 0), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- The deliberate anon grant. EXECUTE only — no table or schema privilege.
REVOKE ALL ON FUNCTION public.list_public_channels_anon(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_channels_anon(INTEGER, INTEGER)
  TO anon, authenticated, service_role;
