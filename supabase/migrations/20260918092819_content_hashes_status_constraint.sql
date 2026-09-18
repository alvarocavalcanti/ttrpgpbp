-- Review fix L9: content_hashes.safer_status allowed 'error', but nothing ever
-- writes it — a provider failure throws before any row is inserted, so the value
-- was dead and the docs advertised a state that cannot occur. Narrow the
-- constraint to the statuses that are actually reachable.
--
-- (The accompanying messages index moved to its own concurrent migration —
-- indexes on the hot messages table must not take an ACCESS EXCLUSIVE lock on
-- deploy, which a plain CREATE INDEX in a multi-statement file would.)

ALTER TABLE public.content_hashes
  DROP CONSTRAINT content_hashes_safer_status_check;

ALTER TABLE public.content_hashes
  ADD CONSTRAINT content_hashes_safer_status_check
  CHECK (safer_status IN ('unscanned', 'clear', 'match'));
