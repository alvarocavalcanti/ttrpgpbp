-- Security fix (2026-09-25 final audit, P2): the "Profiles are viewable by
-- everyone" SELECT policy (20240801000000 init schema) plus the blanket
-- GRANT SELECT ... TO anon (20260905195245) let an unauthenticated holder of
-- the public anon key enumerate every account's display_name, avatar_url,
-- created_at, suspension status, email opt-in flag and (since
-- 20260922190814) terms-acceptance timestamps.
--
-- The app never reads profiles before sign-in (the marketing shell is static),
-- so revoke the anon grant. Authenticated cross-user reads stay as they are
-- (display names/avatars are needed by the chat UI); scoping the newer
-- personal columns away from authenticated reads is a separate follow-up.

REVOKE SELECT ON public.profiles FROM anon;
