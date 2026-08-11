<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->

# Project Rules

- **Branching & PRs**: Never start working on `main`. ALL changes MUST go through a new branch based off an up-to-date `main`, then a pull request. Never push directly to `main` (protected against rewrites). Fetch + rebase/merge latest `main` before branching.
- **Testing**: Every code change MUST have tests. While 80% coverage is acceptable, the goal is 100%. If new code drops coverage, try to close the gap. This includes adding tests for validations and edge cases. More over, PRs **must** have tests, if we a changing or adding features they must have coverage
- **Documentation**: Whenever new features are added or existing features are modified, check if any documentation needs updating

## Local Testing

1. **Start Local DB:** `npx supabase start`
2. **Apply Migrations:** `npx supabase migration up` (or `npx supabase db reset` to re-apply all migrations from scratch)
3. **Start Dev Server:** `npm run dev`
4. **Login Details:** If using local DB without Google Auth configured, use the Supabase Studio (http://localhost:54323) to create a mock user, or link your `.env.local` to the remote Supabase.

> **Known issue — Docker Desktop blocks local Supabase (macOS).** `supabase start` fails on this
> machine with `error while creating mount source path '.../docker.raw.sock'` when starting the
> `supabase_vector_*` container. This is a Docker Desktop bug, not a migration problem. When it
> bites, do NOT chase the error — skip local DB verification and rely on CI:
> push the branch and let the `migrate-check` job in `.github/workflows/ci.yml` run
> `supabase db start` + `supabase db reset`. Fix any failure via a new migration, then rebase.

## Database Migrations

- **Create a migration**: `npx supabase migration new <name>`
- **Apply locally**: `npx supabase migration up`
- **Verify from scratch**: `npx supabase db reset` — this is what CI runs on every PR
- **Never edit merged migrations**: once a migration is merged/pushed, it is immutable. To fix a schema issue, create a new migration.
- **CI enforcement**:
  - Every PR runs the `migrate-check` job in [.github/workflows/ci.yml](.github/workflows/ci.yml): `supabase db start` + `supabase db reset`. A PR that breaks migrations fails CI.
  - On merge to main, [.github/workflows/migrate.yml](.github/workflows/migrate.yml) runs `supabase db push` against the remote project. If it fails, fix via a new migration.
  - The Supabase CLI version is pinned (`v2.111.0`) in both workflows. Bump only after confirming `supabase link` still works — v2.112.0+ broke it (supabase/cli#6115).
- **Troubleshooting**:
  - `supabase db reset` failing locally = migration depends on existing state. Fix before pushing.
  - Remote push failing = check the `Apply Migrations` workflow logs in GitHub Actions, then push a corrective migration.

## Git Hygiene

- Don't leave untracked and uncommitted files, confirm with me before creating commit
- If changes should not be committed, check with the user what to do. Add to .gitignore? Delete?
- Clean up scratch files (`patch*.mjs`, temp scripts, etc.) before committing. Never commit them — they are tooling artifacts, not source

## Documentation Maintenance

- Keep [FEATURES.md](docs/FEATURES.md) up to date on new, updated and removed features

## Release Management

- When instructed to generate a new version, update the version in all relevant files
- Add a new section to [CHANGELOG.md](docs/CHANGELOG.md)
