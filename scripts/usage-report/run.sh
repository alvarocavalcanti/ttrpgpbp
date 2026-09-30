#!/bin/sh
# Role by Post usage-report runner.
#
# Resolves the Supabase access token and linked project ref, then calls the
# read-only Management API query endpoint and prints the report JSON.
#
# A fresh git worktree has no .env and no supabase/.temp/linked-project.json
# (both are gitignored), so resolution self-heals: it falls back to the primary
# worktree's copies and to the Supabase CLI's own token file. No re-linking.
#
# Usage: sh scripts/usage-report/run.sh [--resolve-only]
#   --resolve-only  print the resolved ref and whether a token was found (never
#                   the token itself) and exit — used by the tests.
set -eu

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"

SQL="$ROOT/.opencode/skills/usage-report/usage.sql"
TOKEN_FILE="$HOME/.supabase/access-token"

# The primary worktree is the first entry of `git worktree list`; a linked
# checkout created from it can borrow its .env and linked-project.json.
MAIN_WT=$(git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | head -n1) || true
[ -n "${MAIN_WT:-}" ] || MAIN_WT=$ROOT

read_env_var() {  # read_env_var <file> <key>
  [ -f "$1" ] || return 1
  sed -n "s/^$2=//p" "$1" | head -n1 | tr -d '"' | tr -d "'"
}

resolve_token() {
  if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then printf '%s' "$SUPABASE_ACCESS_TOKEN"; return 0; fi
  v=$(read_env_var "$ROOT/.env" SUPABASE_ACCESS_TOKEN || true)
  [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  v=$(read_env_var "$MAIN_WT/.env" SUPABASE_ACCESS_TOKEN || true)
  [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  [ -f "$TOKEN_FILE" ] && { tr -d '\n' < "$TOKEN_FILE"; return 0; }
  return 1
}

resolve_ref() {
  if [ -n "${SUPABASE_PROJECT_REF:-}" ]; then printf '%s' "$SUPABASE_PROJECT_REF"; return 0; fi
  for f in "$ROOT/supabase/.temp/linked-project.json" "$MAIN_WT/supabase/.temp/linked-project.json"; do
    [ -f "$f" ] || continue
    r=$(jq -r '.ref // empty' "$f" 2>/dev/null || true)
    [ -n "$r" ] && { printf '%s' "$r"; return 0; }
  done
  return 1
}

TOKEN=$(resolve_token || true)
[ -n "$TOKEN" ] || {
  echo "usage-report: no Supabase access token found." >&2
  echo "  Set SUPABASE_ACCESS_TOKEN (or add it to .env)." >&2
  echo "  Fallback: 'npx supabase login' writes ~/.supabase/access-token when the CLI" >&2
  echo "  does not use native credential storage (e.g. an OS keychain)." >&2
  exit 1
}

REF=$(resolve_ref || true)
[ -n "$REF" ] || {
  echo "usage-report: no linked Supabase project found." >&2
  echo "  Run: npx supabase link --project-ref <ref>  (or set SUPABASE_PROJECT_REF)" >&2
  exit 1
}

if [ "${1:-}" = "--resolve-only" ]; then
  echo "ref=$REF"
  echo "token=present (${#TOKEN} chars)"
  exit 0
fi

BODY=$(jq -n --rawfile q "$SQL" '{query:$q, read_only:true}') || {
  echo "usage-report: failed to build the query request body." >&2
  exit 1
}

RESPONSE=$(printf '%s' "$BODY" | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @-) || {
  echo "usage-report: request to the Supabase Management API failed." >&2
  exit 1
}

# Success is `[{ "report": { … } }]`; an error body is a `{ message, code }`
# object. Index only arrays so an error object passes through unchanged.
printf '%s' "$RESPONSE" | jq 'if type == "array" then (.[0].report // .) else . end'
