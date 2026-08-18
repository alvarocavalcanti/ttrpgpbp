-- #211: keep image cleanup server-to-server and auditable.
--
-- The edge function uses the service role, so this table is intentionally
-- inaccessible to anon/authenticated clients.
CREATE TABLE image_cleanup_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id UUID NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  cutoff_at TIMESTAMPTZ NOT NULL,
  object_paths TEXT[] NOT NULL CHECK (cardinality(object_paths) > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'deleted', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX image_cleanup_audit_run_idx ON image_cleanup_audit (run_id);

ALTER TABLE image_cleanup_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE image_cleanup_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE image_cleanup_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE image_cleanup_audit_id_seq TO service_role;
