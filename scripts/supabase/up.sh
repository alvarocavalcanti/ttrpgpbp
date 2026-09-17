#!/bin/sh
# Bring the local Supabase stack up and regenerate .env.local from it.
# Idempotent: safe to run while the stack is already up.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

# shellcheck disable=SC2086
if ! $SUPABASE_BIN status >/dev/null 2>&1; then
  echo "Starting local Supabase stack (project: $PROJECT_ID)..."
  # shellcheck disable=SC2086
  $SUPABASE_BIN start
else
  echo "Local Supabase stack already running (project: $PROJECT_ID)."
fi

# `supabase start` applies migrations on a fresh volume, but a stack another
# worktree already started will not pick up migrations merged since. Apply
# pending ones so `supabase:up` is deterministic; a no-op when up to date.
echo "Applying pending migrations..."
# shellcheck disable=SC2086
$SUPABASE_BIN migration up --local

# `status -o env` prints KEY="value". Values may contain '=' (JWTs), so slice on
# the first '=' only and keep the remainder intact.
# shellcheck disable=SC2086
status_env=$($SUPABASE_BIN status -o env)
api_url=$(printf '%s\n' "$status_env" | sed -n 's/^API_URL=//p' | head -n 1)
anon_key=$(printf '%s\n' "$status_env" | sed -n 's/^ANON_KEY=//p' | head -n 1)
api_url=${api_url#\"}
api_url=${api_url%\"}
anon_key=${anon_key#\"}
anon_key=${anon_key%\"}

if [ -z "$api_url" ] || [ -z "$anon_key" ]; then
  echo "FATAL: could not read API_URL/ANON_KEY from 'supabase status -o env'." >&2
  exit 1
fi

# Stage then move: a failed generation must never clobber a working .env.local.
tmp="$ENV_FILE.tmp.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
{
  printf 'VITE_SUPABASE_URL=%s\n' "$api_url"
  printf 'VITE_SUPABASE_ANON_KEY=%s\n' "$anon_key"
} > "$tmp"

if ! grep -q '^VITE_SUPABASE_URL=' "$tmp" || ! grep -q '^VITE_SUPABASE_ANON_KEY=' "$tmp"; then
  echo "FATAL: generated env file is incomplete; leaving .env.local untouched." >&2
  exit 1
fi

mv "$tmp" "$ENV_FILE"
trap - EXIT HUP INT TERM

echo "Wrote $ENV_FILE from the local stack:"
echo "  VITE_SUPABASE_URL=$api_url"
echo "  VITE_SUPABASE_ANON_KEY=<local anon key>"
echo "Note: shell-exported VITE_* vars (direnv) still override .env.local."
echo "      Run 'unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY' if the dev server should target remote."
