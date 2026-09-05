-- Issue #402 / SEC-4: GDPR export omits the reporter's own abuse reports.
-- Right-of-access completeness: the report's reason text is personal data
-- the reporter could not read back (SELECT was admin-only). Authors keep
-- admin visibility unchanged (permissive policies OR together).
CREATE POLICY "Reporters can read back their own reports"
  ON abuse_reports FOR SELECT
  USING (reporter_id = auth.uid());
