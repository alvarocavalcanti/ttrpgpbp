#!/bin/sh
# Guard: a migration added by this branch must sort AFTER every migration
# already on the base branch.
#
# Supabase applies migrations in filename (timestamp) order, and `supabase db
# push` refuses when a local migration predates the last one already applied
# on the remote ("Found local migration files to be inserted before the last
# migration on remote database"). That is what broke the Apply Migrations
# workflow on main on 2026-09-22: the terms-acceptance migration
# (20260921172949, PR #574) merged after 20260921190433 (PR #573) had already
# been pushed. Branch protection requires PRs to be up to date with main, so
# failing here forces a rebase + a fresh timestamp before the merge.
#
# Usage: check-migration-order.sh [base-ref]   (default: origin/main)
set -eu

BASE_REF="${1:-origin/main}"

if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  echo "check-migration-order: base ref '${BASE_REF}' not found; skipping."
  exit 0
fi

base_files="$(git ls-tree -r --name-only "$BASE_REF" -- supabase/migrations | grep '\.sql$' | sort || true)"
head_files="$(git ls-tree -r --name-only HEAD -- supabase/migrations | grep '\.sql$' | sort || true)"

if [ -z "$base_files" ]; then
  echo "check-migration-order: no migrations on ${BASE_REF}; nothing to check."
  exit 0
fi

# 14-digit timestamps; lexicographic sort equals numeric order.
base_max="$(printf '%s\n' "$base_files" | sed 's#.*/##' | cut -d_ -f1 | sort | tail -1)"

base_tmp="$(mktemp)"
head_tmp="$(mktemp)"
trap 'rm -f "$base_tmp" "$head_tmp"' EXIT

printf '%s\n' "$base_files" > "$base_tmp"
printf '%s\n' "$head_files" > "$head_tmp"

# Paths present on this branch but not on the base: new migrations, including
# a rename to a newer timestamp.
new_files="$(comm -13 "$base_tmp" "$head_tmp")"

if [ -z "$new_files" ]; then
  echo "check-migration-order: no new migrations."
  exit 0
fi

failed=0
for file in $new_files; do
  version="$(basename "$file" | cut -d_ -f1)"
  if [ "$version" -le "$base_max" ]; then
    echo "::error file=${file}::Migration ${version} sorts at or before ${base_max}, the latest migration on ${BASE_REF}."
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "check-migration-order: out-of-order migration(s) detected." >&2
  echo "Rebase on main and recreate the migration with 'npx supabase migration new <name>'" >&2
  echo "so its timestamp is newest, then re-run typegen. If it was already pushed to the" >&2
  echo "remote, rename the unapplied file to a newer timestamp instead (see AGENTS.md)." >&2
  exit 1
fi

echo "check-migration-order: OK (every new migration sorts after ${base_max})."
