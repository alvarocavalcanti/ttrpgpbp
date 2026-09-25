#!/bin/sh
# Pre-commit guard: a commit that adds, modifies, or copies a migration must
# also stage the regenerated types. CI diffs `supabase gen types` output and
# fails the PR on any drift; this catches the recurring miss of landing a
# (follow-up) migration without re-running typegen, with no database needed.
#
# Exemptions (a migration that cannot change the generated types):
#   - an exact, in-place rename (git reports R100) — restores timestamp order
#     (see check-migration-order.sh) without touching SQL;
#   - a migration whose added lines contain no schema-shape statement, e.g. a
#     grants/revoke, a policy, or a plain index migration. Generated types come
#     from tables/views/functions/types, so those migrations leave
#     src/types/database.ts byte-identical and there is nothing to stage.
# A migration that is deleted or moved out of supabase/migrations/ still
# requires the regenerated types (dropping schema can change them).
# Correctness of the regenerated file itself remains CI's job.
set -eu

# Hooks inherit their caller's environment, and IDEs/wrappers sometimes
# redirect git (GIT_DIR et al). Force normal repository discovery so the
# guard always inspects the repo being committed — never some other repo.
# GIT_INDEX_FILE is deliberately preserved: git points the pre-commit hook
# at the index being committed, and the guard must read that same index.
unset GIT_DIR GIT_WORK_TREE GIT_CEILING_DIRECTORIES GIT_COMMON_DIR \
  GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

staged="$(git diff --cached --name-only)" || {
  echo "error: check-types-staged could not read the staged files." >&2
  exit 2
}
# Status of the migration-path change. "A" = added/copied, "M" = modified or
# renamed-with-edits, "D" = deleted or moved. For A/M the changed lines are
# inspected for a DDL keyword; a deletion/move always requires types.
#
# Known ceiling: a line-based keyword check cannot see a column type change
# (`id integer` -> `id text`) or a removed CREATE TABLE that carries no keyword
# on the changed line. CI diffs the regenerated types authoritatively, so this
# local guard is a fast heuristic, not the final word.
migration_change="$(git diff --cached --name-status -M | awk -F'\t' '
  # Exact in-place migration rename: schema unchanged, exempt.
  $1 == "R100" && $2 ~ /^supabase\/migrations\// && $3 ~ /^supabase\/migrations\// { next }
  # Added / copied in place: inspect the added lines for DDL.
  $1 ~ /^[AC]/ && ($2 ~ /^supabase\/migrations\// || $3 ~ /^supabase\/migrations\//) { print "A"; next }
  # Modified in place (2 fields) or renamed-with-edits (3 fields): inspect
  # added + removed lines.
  $1 ~ /^M/ && $2 ~ /^supabase\/migrations\// { print "M"; next }
  $1 ~ /^R/ && $2 ~ /^supabase\/migrations\// && $3 ~ /^supabase\/migrations\// { print "M"; next }
  # Deleted, moved out of, or moved into the migrations directory: require types.
  $2 ~ /^supabase\/migrations\// || $3 ~ /^supabase\/migrations\// { print "D"; next }
')" || {
  echo "error: check-types-staged could not inspect the staged changes." >&2
  exit 2
}

# "D" wins over "A"/"M": a deletion or move in the staged set must force types
# even when another migration is added or edited.
types_required=""
case "$migration_change" in
  "") ;;
  *D*) types_required="yes" ;;
  *M*)
    if git diff --cached -U0 -M -- supabase/migrations \
      | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
      | grep -Eiq '\b(CREATE|ALTER|DROP)[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?(TABLE|FUNCTION|TYPE|VIEW|MATERIALIZED[[:space:]]+VIEW|SEQUENCE)\b'; then
      types_required="yes"
    fi
    ;;
  *A*)
    # Only a schema-shape statement can change the generated types; grants,
    # policies, indexes and comments cannot.
    if git diff --cached -U0 -M -- supabase/migrations \
      | grep '^+' | grep -v '^+++' \
      | grep -Eiq '\b(CREATE|ALTER|DROP)[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?(TABLE|FUNCTION|TYPE|VIEW|MATERIALIZED[[:space:]]+VIEW|SEQUENCE)\b'; then
      types_required="yes"
    fi
    ;;
esac

if [ -n "$types_required" ]; then
  if ! printf '%s\n' "$staged" | grep -q '^src/types/database.ts$'; then
    echo "error: staged migrations without src/types/database.ts." >&2
    echo "Run: npx supabase gen types typescript --local > src/types/database.ts" >&2
    echo "then stage the result with this commit (see AGENTS.md)." >&2
    exit 1
  fi
fi
