-- Review fix N3: the per-user rolling upload cap counts content_hashes rows for
-- an uploader since a cutoff, but the table only had content_hashes_channel_idx.
-- Without this the cap pays an ever-growing sequential scan on every upload,
-- trading provider cost for DB cost on the same path.
--
-- The table is new and empty on first deploy (image uploads are off by default),
-- so a plain CREATE INDEX here is not a lock concern.

CREATE INDEX IF NOT EXISTS content_hashes_uploaded_by_created_idx
  ON public.content_hashes (uploaded_by, created_at DESC);
