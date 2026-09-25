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

A scheduled GitHub Actions dump is the intended upgrade (tracked in
[#604](https://github.com/alvarocavalcanti/ttrpgpbp/issues/604)); until it
exists, run the manual backup on a fixed cadence.

## What a complete backup contains

`supabase db dump` is **schema-only by default** and **excludes the `auth` and
`storage` schemas**. A real backup of this app needs four parts:

| Part | What it holds | Command |
|---|---|---|
| Schema | tables, functions, policies, triggers | `supabase db dump -f schema.sql` |
| Application data | profiles, channels, messages, dice rolls, favorites, … | `supabase db dump --data-only -f data.sql` |
| Auth data | `auth.users`, sessions | `supabase db dump --schema auth --data-only -f auth-data.sql` |
| Roles | database roles/grants | `supabase db dump --role-only -f roles.sql` |

**Storage objects are not in a database dump.** Uploaded images live in the
`images` bucket and must be copied separately from the S3-compatible Storage
endpoint (Dashboard → Storage → S3 connection, or `rclone`/`aws s3` against
that endpoint). Keep the object copy alongside the dumps so the two stay in
sync.

## Manual backup (free tier — do this on a schedule)

Run at least weekly, and before any risky change (bulk update, migration
backfill, etc.):

```bash
supabase link --project-ref <PROJECT_ID>
BACKUP_DIR="backup-$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"
supabase db dump -f "$BACKUP_DIR/schema.sql"
supabase db dump --data-only -f "$BACKUP_DIR/data.sql"
supabase db dump --schema auth --data-only -f "$BACKUP_DIR/auth-data.sql"
supabase db dump --role-only -f "$BACKUP_DIR/roles.sql"
```

Store the directory somewhere durable and outside the repository (it contains
all user data), together with a copy of the `images` bucket objects.
`supabase db dump` needs the database password for the linked project — export
`SUPABASE_DB_PASSWORD` or pass `-p`.

## Restore into a local or scratch instance

Restore **all four parts** — a schema-only restore leaves an empty app.

```bash
set -euo pipefail
npx supabase start                                    # empty local stack
psql --set ON_ERROR_STOP=on -h localhost -p 54322 -U postgres -f roles.sql
psql --set ON_ERROR_STOP=on -h localhost -p 54322 -U postgres -f schema.sql
psql --set ON_ERROR_STOP=on -h localhost -p 54322 -U postgres -f data.sql
psql --set ON_ERROR_STOP=on -h localhost -p 54322 -U postgres -f auth-data.sql
```

`ON_ERROR_STOP=on` (with `set -e`) makes the restore halt on the first SQL
error instead of continuing into a partial restore.

Then copy the `images` bucket objects back through the Storage S3 endpoint.
Do **not** run `supabase db reset` after importing: it recreates the database
and reapplies migrations, discarding everything you just restored.

Verify the app against the restored database (start it and exercise the core
flows), then record the drill.

## Restore drill (verification)

Prove a dump is usable — do not just take them:

1. **Back up production** with the four commands above.
2. **Spin up a clean local environment:** `npx supabase start`.
3. **Restore** `roles.sql`, `schema.sql`, `data.sql`, `auth-data.sql` (in that
   order), then the Storage objects.
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
