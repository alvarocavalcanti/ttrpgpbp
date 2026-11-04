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

# Remove *superseded* Supabase images: an image no container references whose
# service the running stack does use (same repository, older tag) — i.e. what a
# CLI upgrade leaves behind. Must only be called while the stack is up:
# containers then hold the current set. `rmi -f` is required because the CLI
# tags one image under both the ghcr and ecr registries and Docker refuses a
# plain `rmi` on a multi-tagged image.
#
# Scoping by service name is deliberate. A bare "not referenced ⇒ remove" would
# also delete images for a service this stack runs without (`supabase start -x`)
# or a second Supabase project on the same daemon, forcing a multi-GB re-pull
# on its next start. Services the running stack does not use are left alone.
prune_supabase_images() {
  if ! containers=$($DOCKER_BIN ps -aq); then
    echo "Skipping Supabase image cleanup: could not list containers." >&2
    return 0
  fi

  keep_ids=""
  if [ -n "$containers" ]; then
    # One inspect for every container, not one per container. A failed inspect
    # would leave an incomplete keep set — refuse to delete anything then.
    # shellcheck disable=SC2086
    if ! raw_ids=$($DOCKER_BIN inspect --format '{{.Image}}' $containers); then
      echo "Skipping Supabase image cleanup: could not inspect containers." >&2
      return 0
    fi
    keep_ids=$(printf '%s\n' "$raw_ids" | sed 's/^sha256://' | cut -c1-12 | sort -u)
  fi

  if ! listing=$($DOCKER_BIN image ls --format '{{.ID}}|{{.Repository}}'); then
    echo "Skipping Supabase image cleanup: could not list images." >&2
    return 0
  fi

  # Only the two registries the CLI uses are matched. If the CLI ever switches
  # registry again, unmatched images are left alone: prune degrades to doing
  # nothing rather than risking an unrelated lookalike.
  kept_services=""
  candidates=""
  for row in $listing; do
    id=${row%%|*}
    repo=${row#*|}
    case "$repo" in
      public.ecr.aws/supabase/* | ghcr.io/supabase/*) ;;
      *) continue ;;
    esac
    service=${repo##*/}
    if [ -n "$keep_ids" ] && printf '%s\n' $keep_ids | grep -qx "$id"; then
      kept_services="$kept_services $service"
    else
      candidates="$candidates $id:$service"
    fi
  done

  for candidate in $candidates; do
    id=${candidate%%:*}
    service=${candidate#*:}
    case " $kept_services " in
      *" $service "*)
        $DOCKER_BIN rmi -f "$id" >/dev/null 2>&1 || true
        ;;
    esac
  done
}
