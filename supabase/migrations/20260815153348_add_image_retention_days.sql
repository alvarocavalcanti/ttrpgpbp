-- #134: auto-retention for uploaded images. 0 (default) keeps images forever;
-- any positive value makes the daily cleanup-images edge function delete
-- images older than that many days.
INSERT INTO app_settings (key, value) VALUES ('image_retention_days', '0')
ON CONFLICT (key) DO NOTHING;
