# Backup and Restore

## RPO and RTO Targets

- **Recovery Point Objective (RPO):** 24 hours (daily backups in Supabase Pro tier) or up to the minute using Point-in-Time Recovery (PITR).
- **Recovery Time Objective (RTO):** 1-2 hours (time required to restore a database snapshot into a new or existing instance).

## Restore Procedure (Point in Time Recovery)

If you have PITR enabled (Pro Tier):

1. Go to the Supabase Dashboard -> Database -> Backups.
2. Select PITR.
3. Choose the exact minute you want to restore to.
4. Click **Restore**.

## Manual Restore Drill (CLI)

1. Export the database:

   ```bash
   supabase db dump --project-ref <PROJECT_ID> > backup.sql
   ```

2. Restore to a local or scratch project:

   ```bash
   supabase db start
   psql -h localhost -p 54322 -U postgres -f backup.sql
   ```

3. Run integration tests or manually verify the application flow.

## Backup/Restore Drill Plan (Verification)

Run a regular verification check to ensure backup integrity:

1. **Dump production data:**

   ```bash
   npx supabase db dump --db-url "$PRODUCTION_DB_URL" --data-only > data_dump.sql
   npx supabase db dump --db-url "$PRODUCTION_DB_URL" --role-only > roles_dump.sql
   ```

2. **Spin up a local clean environment:**

   ```bash
   npx supabase db reset
   ```

3. **Restore dumps to the local database:**

   ```bash
   psql "$LOCAL_DB_URL" -f roles_dump.sql
   psql "$LOCAL_DB_URL" -f data_dump.sql
   ```

4. **Run integration and E2E tests:**

   Verify that restoring the backup does not break schemas, triggers, or existing relationships by running:

   ```bash
   npm run test:e2e
   ```
