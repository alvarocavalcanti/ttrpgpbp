#!/bin/sh
# Shared helpers for the local Supabase lifecycle scripts, sourced by
# up.sh / down.sh / reset.sh / prune.sh. POSIX sh only.

# Resolve the repository root from this file so the scripts work from any cwd.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

SUPABASE_BIN="${SUPABASE_BIN:-npx supabase}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.local}"

# Container label filter is derived from config.toml so it can never drift from
# the stack the CLI actually manages.
PROJECT_ID=$(sed -n 's/^project_id *= *"\(.*\)".*/\1/p' "$REPO_ROOT/supabase/config.toml")
if [ -z "$PROJECT_ID" ]; then
  echo "FATAL: could not read project_id from supabase/config.toml" >&2
  exit 1
fi

# True when this project has at least one running container: the current image
# set is in use (and therefore protected from `docker rmi`).
supabase_running() {
  [ -n "$($DOCKER_BIN ps -q --filter "label=com.supabase.cli.project=$PROJECT_ID")" ]
}
