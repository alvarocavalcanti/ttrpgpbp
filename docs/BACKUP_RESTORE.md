# Backup and Restore

## Free-tier reality (read this first)

The project's zero-cost constraint means **Supabase's free tier keeps no
automated database backups** (only ~1 day of logs). Daily backups and
Point-in-Time Recovery are **Pro-plan features — Supabase Pro is
$25/org/month, and PITR is a paid add-on on top** — so they are not available
here unless the operator chooses to pay.

On the free tier the real recovery point is **whenever the operator last ran a
manual dump**. Treat the cadence below as the backup plan, not a fallback.

- **Target RPO (manual cadence):** up to 7 days.
- **Target RTO:** 1–2 hours to restore a dump into a scratch/local instance.

A scheduled GitHub Actions dump is the intended upgrade (a follow-up issue);
until it exists, run the manual dump on a fixed cadence.

## Manual dump (free tier — do this on a schedule)

Run at least weekly, and before any risky change (bulk update, migration
backfill, etc.):

```bash
supabase link --project-ref <PROJECT_ID>
supabase db dump -f backup-$(date +%Y%m%d).sql
```

Store the file somewhere durable and outside the repository (it contains all
user data). `supabase db dump` needs the database password for the linked
project — export `SUPABASE_DB_PASSWORD` or pass `-p`.

## Restore into a local or scratch instance

```bash
npx supabase start            # or: supabase db start
psql -h localhost -p 54322 -U postgres -f backup-YYYYMMDD.sql
npx supabase db reset         # re-apply migrations if the dump is schema-only
```

Then verify the app flow against the restored database.

## Restore drill (verification)

Prove a dump is usable — do not just take them:

1. **Dump production:**

   ```bash
   supabase db dump -f drill.sql
   ```

2. **Spin up a clean local environment:**

   ```bash
   npx supabase db reset
   ```

3. **Restore into it:**

   ```bash
   psql -h localhost -p 54322 -U postgres -f drill.sql
   ```

4. **Run the suites:**

   ```bash
   npx vitest run
   npx playwright test
   ```

Record the date of each drill and the observed RTO.

## Pro-tier options (only if the operator pays)

Supabase Pro ($25/org/month) enables daily backups; PITR is a paid add-on and
restores to the minute:

1. Supabase Dashboard → Database → Backups.
2. Select PITR, choose the exact minute, click **Restore**.
