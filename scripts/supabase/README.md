# Local Supabase lifecycle scripts

Deterministic start/stop/reset/prune for the local Supabase stack, wired into
`package.json`:

| Command | Does |
| --- | --- |
| `npm run supabase:up` | Starts the stack if needed (idempotent) and regenerates `.env.local` from it — fail-closed: a partial generation never overwrites a working file. |
| `npm run supabase:down` | Stops the stack, keeping data volumes. No-op when already stopped. |
| `npm run supabase:reset` | `down --no-backup` → `up` → `supabase db reset`: wipes volumes and re-applies every migration from scratch. |
| `npm run supabase:prune` | Reclaims Docker space: dangling image layers always, plus unused Supabase image versions while the stack is up. |

## Notes

- **The stack is shared across worktrees.** All worktrees resolve the same
  `project_id` (`ttrpgpbp`), so there is a single stack on the machine and
  `supabase:down` takes it down for every worktree.
- **`.env.local` is overwritten by `supabase:up`.** It is gitignored and derived
  entirely from the local stack. Shell-exported `VITE_*` variables (direnv) still
  win over it — `unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY` if the dev
  server should target a remote project instead.
- **`supabase:prune` is guarded.** It refuses the image cleanup while the stack is
  down, because the current image set would look unused and the next start would
  re-pull several GB. While the stack is up, containers hold the images the CLI
  needs and Docker refuses to remove them. Only unused (old-version) Supabase
  images are removed; the untagged-layer pass is always safe.
- **Tests** live in `supabaseScripts.test.ts` and run under the normal `npm test`
  suite. They stub the Supabase CLI and Docker, so they need neither.
