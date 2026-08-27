# Contributing

Thanks for wanting to contribute to RoleByPost!

## Project philosophy

- **Chat-first.** This is a Play-by-Post chat app. New features should improve the chat experience.
- **Keep it minimal.** App features are kept to a minimum to avoid bloat. No embedded maps, notepads, or full game simulators — external links for that (map URL, resources URL).
- **UX and quality of life are a priority.** Polish on what exists beats adding more.

When in doubt about whether a feature fits, open an issue to discuss it before building.

## Development setup

1. `npm install`
2. Set up `.env.local` — see the README's [Development Setup](README.md#development-setup).
3. `npm run dev`

See the README for testing and linting commands.

## Project structure

- `src/` — React app (components, hooks, service worker)
- `supabase/migrations/` — SQL migrations (immutable once merged)
- `supabase/functions/` — Edge Functions (e.g. `push-notifications`)
- `docs/` — FEATURES, SCHEMA, CHANGELOG
- `public/` — static assets, PWA icons

## Workflow

1. Create a branch from `main`: `<prefix>/<slug>` (e.g. `feat/dark-mode`, `fix/ios-push`).
2. Make your changes. Commit with a clear, concise message.
3. Open a pull request against `main`. CI runs lint, type-check, tests with coverage, and a from-scratch migration check (`supabase db reset`).
4. Push to `main` is protected — all changes go through PRs.

Full agent and contributor rules (including the git worktree workflow) live in [AGENTS.md](AGENTS.md).

## Code conventions

- TypeScript, React functional components, Tailwind CSS.
- Run `npm run lint` (oxlint) before pushing.
- Every change must have tests. Coverage minimum is 80% for lines, functions, and statements, and 79% for branches (goal is 100%); a PR that lowers coverage will fail CI.

## Database changes

- Create a migration with `npx supabase migration new <name>`.
- **Never edit a merged migration.** Fix schema issues with a new migration.
- Enable RLS on new tables and add policies.
- CI validates migrations apply from scratch; merging to `main` auto-pushes them to the remote project.

## Documentation

- Update `docs/FEATURES.md` when you add/change/remove features.
- Add a `docs/CHANGELOG.md` entry under [Unreleased] (Added / Changed / Fixed).

## Pull request checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` passes (type-check)
- [ ] `npm run test` passes with coverage not lowered
- [ ] New features have tests
- [ ] Migrations apply from scratch (CI verifies)
- [ ] `docs/FEATURES.md` and `docs/CHANGELOG.md` updated
