-- Checks with a called-out DC store the target and outcome on the message so
-- the roll result can be styled as success/failure (see issue #157).
ALTER TABLE messages ADD COLUMN roll_dc INTEGER;
ALTER TABLE messages ADD COLUMN roll_success BOOLEAN;
