-- Server admin flag for profiles. Only directly editable via Supabase admin.
ALTER TABLE profiles ADD COLUMN server_admin BOOLEAN NOT NULL DEFAULT false;

-- At most one server admin. Partial unique index: only rows where server_admin = true are indexed.
CREATE UNIQUE INDEX profiles_server_admin_idx ON profiles (server_admin) WHERE server_admin = true;
