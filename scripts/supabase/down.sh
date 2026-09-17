#!/bin/sh
# Stop the local Supabase stack. Idempotent. Data volumes are kept by default.
# --no-backup also deletes the data volumes (used by reset.sh).
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

purge=0
case "${1:-}" in
  "") ;;
  --no-backup) purge=1 ;;
  *)
    echo "usage: $0 [--no-backup]" >&2
    exit 2
    ;;
esac

if ! supabase_running; then
  echo "Local Supabase stack already stopped (project: $PROJECT_ID)."
  exit 0
fi

if [ "$purge" = 1 ]; then
  echo "Stopping local Supabase stack and deleting data volumes..."
  # shellcheck disable=SC2086
  $SUPABASE_BIN stop --no-backup
else
  echo "Stopping local Supabase stack (data volumes kept)..."
  # shellcheck disable=SC2086
  $SUPABASE_BIN stop
fi

echo "Done. Other worktrees share this stack — it is now down for all of them."
