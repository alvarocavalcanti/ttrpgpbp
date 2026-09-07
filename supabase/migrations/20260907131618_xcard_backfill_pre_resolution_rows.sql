-- #431 [P2.12]: the GM's mount-time catch-up used to filter unresolved
-- X-Card events by created_at (7-day window) because rows raised in the
-- pre-resolution era were dismissed client-side only — persisted dismissal
-- (resolved_at) did not exist yet, so "unresolved" did not mean "unhandled"
-- for them. Backfill exactly those legacy rows as resolved (rows created
-- before the resolved_at column existed, i.e. before 2026-09-06 09:52:25+00)
-- so the catch-up can drop the age horizon and count precisely everything
-- unresolved: unresolved = unhandled. Rows on/after the cutoff with
-- resolved_at IS NULL are genuinely unhandled and stay surfaced.
UPDATE safety_card_events
SET resolved_at = '2026-09-06 09:52:25+00'
WHERE created_at < '2026-09-06 09:52:25+00'
  AND resolved_at IS NULL;
