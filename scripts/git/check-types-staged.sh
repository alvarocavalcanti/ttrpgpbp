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
#   - a migration that only replaces the bodies of functions already present
#     in the committed types (see only_replaces_typed_functions below).
#     Regenerating then yields a byte-identical file git cannot stage, so
#     demanding it would block the commit with no legitimate path forward.
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

# True when every schema-shape statement in the staged migration diff is a
# CREATE OR REPLACE FUNCTION whose signature already exists in the committed
# types: replacing a body cannot change the generated output, so the regen
# would be byte-identical and unstoppable-by-staging. Anything else — new
# functions (bare CREATE FUNCTION or an unknown name), ALTER/DROP, tables,
# views, types, or an unparseable header — stays required. CI remains the
# authoritative check: a signature change slipping through here fails there,
# while a false block here has no legitimate remedy.
only_replaces_typed_functions() {
  # SQL `--` comments carry prose like "keep/drop" that would trip the
  # keyword scan, and string literals can hold words like 'drop'; strip
  # both first. Residual ceiling: a bare DDL keyword inside a dollar-quoted
  # body (outside any single-quoted literal) still requires types and stays
  # CI's catch, per the heuristic.
  added="$(git diff --cached -U0 -M -- supabase/migrations \
    | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
    | sed -E 's/--.*$//' | sed -E "s/'(''|[^'])*'//g" \
    | tr '[:upper:]' '[:lower:]' || true)"
  [ -n "$added" ] || return 1
  # Strip the one acceptable statement, then nothing schema-shaping may
  # remain (covers bare CREATE FUNCTION, ALTER, DROP, tables, views,
  # types, and headers split across lines).
  stripped="$(printf '%s\n' "$added" \
    | sed -E 's/create[[:space:]]+or[[:space:]]+replace[[:space:]]+function[[:space:]]+[a-z0-9_".]+//g')"
  if printf '%s\n' "$stripped" | grep -Eq '\b(create|alter|drop)\b'; then
    return 1
  fi
  names="$(printf '%s\n' "$added" \
    | grep -Eo 'create[[:space:]]+or[[:space:]]+replace[[:space:]]+function[[:space:]]+[a-z0-9_".]+' \
    | sed -E 's/.*function[[:space:]]+//')"
  [ -n "$names" ] || return 1
  types_file="$(git show HEAD:src/types/database.ts 2>/dev/null || true)"
  [ -n "$types_file" ] || return 1
  for n in $names; do
    # Schema-qualify the lookup (bare names live in public): a column that
    # merely shares the function name must not satisfy it, so match the key
    # only inside that schema's Functions block and only when its entry
    # carries Args (columns never do).
    plain="$(printf '%s' "$n" | tr -d '"')"
    case "$plain" in
      *.*) schema="${plain%%.*}"; base="${plain#*.}" ;;
      *) schema="public"; base="$plain" ;;
    esac
    block="$(printf '%s\n' "$types_file" | awk -v schema="$schema" '
      !in_schema {
        if ($0 ~ "^[[:space:]]*\"?" schema "\"?[[:space:]]*:[[:space:]]*\\{[[:space:]]*$") {
          in_schema = 1; depth = 1
        }
        next
      }
      in_schema && !in_funcs {
        if ($0 ~ "Functions:[[:space:]]*\\{") {
          in_funcs = 1
          print
          fdepth = split($0, _o, "\\{") - split($0, _c, "\\}")
          if (fdepth <= 0) exit
          next
        }
        depth += split($0, _o, "\\{") - split($0, _c, "\\}")
        if (depth <= 0) exit
        next
      }
      in_funcs {
        print
        fdepth += split($0, _o, "\\{") - split($0, _c, "\\}")
        if (fdepth <= 0) exit
      }')"
    [ -n "$block" ] || return 1
    if ! printf '%s\n' "$block" | tr '[:upper:]' '[:lower:]' | awk -v name="$base" '
      {
        if (!found && $0 ~ "^[[:space:]]*\"?" name "\"?[[:space:]]*:[[:space:]]*\\{") {
          found = 1
          match($0, /[^[:space:]]/)
          indent = substr($0, 1, RSTART - 1)
          if ($0 ~ /args:/) args = 1
          if ($0 ~ /\}[[:space:]]*$/) exit (args ? 0 : 1)
          next
        }
        if (found) {
          if ($0 ~ /args:/) args = 1
          if ($0 ~ "^" indent "\\},?[[:space:]]*$") exit (args ? 0 : 1)
        }
      }
      END { exit (found && args ? 0 : 1) }'; then
      return 1
    fi
  done
  return 0
}

# A body-only function replacement leaves regen byte-identical, which git
# cannot stage — requiring types here would be unanswerable (see above).
if [ -n "$types_required" ] && only_replaces_typed_functions; then
  types_required=""
fi

if [ -n "$types_required" ]; then
  if ! printf '%s\n' "$staged" | grep -q '^src/types/database.ts$'; then
    echo "error: staged migrations without src/types/database.ts." >&2
    echo "Run: npx supabase gen types typescript --local > src/types/database.ts" >&2
    echo "then stage the result with this commit (see AGENTS.md)." >&2
    exit 1
  fi
fi
