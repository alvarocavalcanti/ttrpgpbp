# Local Supabase lifecycle scripts

Deterministic start/stop/reset/prune for the local Supabase stack, wired into
`package.json`:

| Command | Does |
| --- | --- |
| `npm run supabase:up` | Starts the stack if needed (idempotent), applies pending migrations and regenerates `.env.local` from it — fail-closed: a partial generation never overwrites a working file. |
| `npm run supabase:down` | Stops the stack, keeping data volumes, and first reclaims any Supabase images the current stack does not use. No-op when already stopped. Always run it when your work is done — never leave the shared stack running; another session can start it again with `supabase:up`. |
| `npm run supabase:reset` | `down --no-backup` → `up` → `supabase db reset`: wipes volumes and re-applies every migration from scratch. |
| `npm run supabase:prune` | Reclaims Docker space on demand: dangling image layers always, plus unused Supabase image versions while the stack is up. |

## Notes

- **The stack is shared across worktrees.** All worktrees resolve the same
  `project_id` (`ttrpgpbp`), so there is a single stack on the machine and
  `supabase:down` takes it down for every worktree.
- **`.env.local` is overwritten by `supabase:up`.** It is gitignored and derived
  entirely from the local stack. Shell-exported `VITE_*` variables (direnv) still
  win over it — `unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY` if the dev
  server should target the local stack instead.
- **`supabase:prune` is guarded.** It refuses the image cleanup while the stack is
  down, because the current image set would look unused and the next start would
  re-pull several GB. While the stack is up, containers hold the images the CLI
  needs and Docker refuses to remove them.
- **Only superseded versions are removed, never a service the stack does not
  run.** An image is a candidate only when nothing references it *and* the
  running stack uses the same service under a newer tag. So a `supabase start -x
  <service>` stack keeps the excluded service's image, and so does a second
  Supabase project on the same Docker daemon whose services this project does
  not run. (Two projects running *different versions of the same service* still
  race for the tag: the older one is removed and re-pulled on its next start —
  the price of bounding disk to one image set.) The untagged-layer pass is always
  safe. A failed `docker ps`/`inspect` aborts the pass rather than deleting
  against a half-read keep set.
- **`supabase:down` runs that same image pass before stopping.** Stopping first
  would make the whole image set look unused, so the reclaim happens while the
  containers still pin what the current CLI needs. This is what keeps a CLI
  upgrade from leaving the previous version's images behind forever — the older
  tags are never dangling, so `docker image prune` alone does not catch them.
- **Tests** live in `supabaseScripts.test.ts` and run under the normal `npm test`
  suite. They stub the Supabase CLI and Docker, so they need neither.
- **The CLI version is pinned in `package.json`** (`devDependencies.supabase`,
  exact) so `npx supabase` resolves that binary instead of whatever the `npx`
  cache last downloaded — an unpinned CLI silently pulls a whole new image set
  (several GB) on every upgrade. Keep the `supabase/setup-cli` pin in the
  workflows on the same version.
- **`ci-start.sh` is CI-only.** The workflows start the stack through it
  (`SUPABASE_BIN=supabase sh scripts/supabase/ci-start.sh [db-start|start]`), so a
  stale container still holding the published 54322 port is cleaned up and the
  start is retried instead of failing the job before any test runs. Retries back
  off (5s, then 20s) because 5432x sits in Linux's ephemeral port range — an
  outbound socket such as the daemon's image pulls can hold the port with no
  container to remove. When every attempt fails, the script dumps the
  containers and the TCP sockets on 5432x — a wildcard bind conflicts with an
  outbound connection too, not just with a listener — so the next occurrence is
  diagnosable.
