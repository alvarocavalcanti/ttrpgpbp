#!/bin/sh
# Pre-commit guard: a commit staging migrations must also stage the
# regenerated types. CI diffs `supabase gen types` output and fails the PR
# on any drift; this catches the recurring miss of landing a (follow-up)
# migration without re-running typegen, with no database needed.
# Correctness of the regenerated file itself remains CI's job.
set -eu

# Hooks inherit their caller's environment, and IDEs/wrappers sometimes
# redirect git (GIT_DIR et al). Force normal repository discovery so the
# guard always inspects the repo being committed — never some other repo.
# GIT_INDEX_FILE is deliberately preserved: git points the pre-commit hook
# at the index being committed, and the guard must read that same index.
unset GIT_DIR GIT_WORK_TREE GIT_CEILING_DIRECTORIES GIT_COMMON_DIR \
  GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

staged="$(git diff --cached --name-only)" || {
  echo "error: check-types-staged could not read the staged files." >&2
  exit 2
}
if printf '%s\n' "$staged" | grep -q '^supabase/migrations/'; then
  if ! printf '%s\n' "$staged" | grep -q '^src/types/database.ts$'; then
    echo "error: staged migrations without src/types/database.ts." >&2
    echo "Run: npx supabase gen types typescript --local > src/types/database.ts" >&2
    echo "then stage the result with this commit (see AGENTS.md)." >&2
    exit 1
  fi
fi
