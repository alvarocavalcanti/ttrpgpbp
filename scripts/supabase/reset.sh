#!/bin/sh
# Wipe the local database and re-apply every migration from scratch.
# Deletes data volumes: anything only in the local DB is lost.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

sh "$SCRIPT_DIR/down.sh" --no-backup
sh "$SCRIPT_DIR/up.sh"

echo "Applying migrations from scratch..."
# shellcheck disable=SC2086
$SUPABASE_BIN db reset
echo "Local database reset complete."
