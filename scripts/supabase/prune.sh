#!/bin/sh
# Reclaim Docker disk space from local Supabase.
#
# 1. Removes dangling (untagged) image layers — always safe.
# 2. Removes Supabase images no container references. Guarded: it only runs
#    while this project's stack is up, otherwise the current image set would
#    look unused and the next start would re-pull several GB. down.sh runs the
#    same pass before every stop for the same reason — see prune_supabase_images
#    in _common.sh.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

echo "Removing dangling images..."
$DOCKER_BIN image prune -f

if ! supabase_running; then
  echo "Stack down — skipping Supabase image cleanup (it would force a full re-pull)." >&2
  echo "Run 'npm run supabase:up' first if you want to reclaim those images." >&2
  exit 0
fi

prune_supabase_images

echo "Unused Supabase images removed. Current disk usage:"
$DOCKER_BIN system df
