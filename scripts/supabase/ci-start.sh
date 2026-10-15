#!/bin/sh
# Bring the local Supabase stack up in CI, tolerating a stale container that
# still holds a published port.
#
# The GitHub runner image can already have Supabase containers running when the
# job starts. `supabase db start` / `supabase start` stop the tracked containers
# and start them again in the same command, and the container just removed has
# not released 0.0.0.0:54322 yet — the new one then fails with
#
#   failed to bind host port for 0.0.0.0:54322:...: address already in use
#
# and the whole job dies before a single test runs (observed on main CI, run
# 38736496032). Clean up first, then retry the start so a slow port release
# cannot fail the job.
#
# CI sets SUPABASE_BIN=supabase so the pinned setup-cli binary on PATH is used
# instead of _common.sh's `npx supabase` default.
#
# Usage: [SUPABASE_BIN=supabase] ci-start.sh [db-start|start]   (default: db-start)
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

MODE="${1:-db-start}"
case "$MODE" in
  db-start|start) ;;
  *)
    echo "ci-start: unknown mode '$MODE' (expected 'db-start' or 'start')" >&2
    exit 2
    ;;
esac

# Best effort: none of these may fail the job.
cleanup() {
  $SUPABASE_BIN stop >/dev/null 2>&1 || true
  # Match by name as well as by port: the port filter can miss a container that
  # is still shutting down, and any leftover Supabase container blocks the start.
  $DOCKER_BIN ps -aq --filter publish=54322 | xargs -r $DOCKER_BIN rm -f >/dev/null 2>&1 || true
  $DOCKER_BIN ps -aq --filter name=supabase_ | xargs -r $DOCKER_BIN rm -f >/dev/null 2>&1 || true
}

attempt=1
max_attempts=3
# Overridable so tests do not have to wait the real delay.
retry_sleep="${CI_START_RETRY_SLEEP:-5}"
cleanup
while [ "$attempt" -le "$max_attempts" ]; do
  if [ "$MODE" = "start" ]; then
    $SUPABASE_BIN start && exit 0
  else
    $SUPABASE_BIN db start && exit 0
  fi
  if [ "$attempt" -lt "$max_attempts" ]; then
    echo "ci-start: supabase $MODE failed (attempt $attempt/$max_attempts); cleaning up and retrying..." >&2
    cleanup
    # Give the daemon a moment to release the published ports.
    sleep "$retry_sleep"
  fi
  attempt=$((attempt + 1))
done

echo "ci-start: supabase $MODE failed after $max_attempts attempts." >&2
exit 1
