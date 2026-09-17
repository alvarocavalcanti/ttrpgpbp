#!/bin/sh
# Reclaim Docker disk space from local Supabase.
#
# 1. Removes dangling (untagged) image layers — always safe.
# 2. Removes Supabase images no container references. Guarded: it only runs
#    while this project's stack is up, otherwise the current image set would
#    look unused and the next start would re-pull several GB. The keep-set is
#    every image referenced by a container (running or stopped), so the images
#    the CLI currently needs are never touched. `rmi -f` is required because
#    Supabase tags the same image under both the ghcr and ecr registries;
#    Docker refuses a plain `rmi` on a multi-tagged image.
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

# 12-char image IDs referenced by any container, running or stopped. These are
# the current CLI's image set and must survive.
keep_ids=""
for cid in $($DOCKER_BIN ps -aq); do
  keep_ids="$keep_ids $($DOCKER_BIN inspect --format '{{.Image}}' "$cid" \
    | sed 's/^sha256://' | cut -c1-12)"
done

# Only the two registries the CLI uses are matched. If the CLI ever switches
# registry again, unmatched images are left alone: prune degrades to
# dangling-only rather than risking an unrelated lookalike.
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

echo "Unused Supabase images removed. Current disk usage:"
$DOCKER_BIN system df
