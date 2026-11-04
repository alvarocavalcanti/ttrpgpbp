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

# Remove Supabase images no container references — i.e. the image set of a
# previous CLI version. Must only be called while the stack is up: containers
# then hold the current set, so anything else is superseded. `rmi -f` is
# required because the CLI tags one image under both the ghcr and ecr
# registries and Docker refuses a plain `rmi` on a multi-tagged image.
prune_supabase_images() {
  keep_ids=""
  for cid in $($DOCKER_BIN ps -aq); do
    keep_ids="$keep_ids $($DOCKER_BIN inspect --format '{{.Image}}' "$cid" \
      | sed 's/^sha256://' | cut -c1-12)"
  done

  # Only the two registries the CLI uses are matched. If the CLI ever switches
  # registry again, unmatched images are left alone: prune degrades to
  # doing nothing rather than risking an unrelated lookalike.
  candidates=$($DOCKER_BIN image ls --format '{{.ID}}|{{.Repository}}' \
    | grep -E '\|(public\.ecr\.aws/supabase/|ghcr\.io/supabase/)' | cut -d'|' -f1 | sort -u)

  for id in $candidates; do
    keep=0
    for k in $keep_ids; do
      [ "$id" = "$k" ] && keep=1 && break
    done
    [ "$keep" = 1 ] && continue
    $DOCKER_BIN rmi -f "$id" >/dev/null 2>&1 || true
  done
}
