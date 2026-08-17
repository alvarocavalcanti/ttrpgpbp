#!/bin/sh
# Sanitize NODE_OPTIONS: drop any --import=<file> flag whose target file is
# missing. A dangling import (e.g. a stale headroom hook-shim) crashes every
# node process at startup, which historically forced --no-verify. Prints the
# cleaned value to stdout; hooks capture it and export it before running npm.
sanitize_node_options() {
  [ -z "$NODE_OPTIONS" ] && return 0
  result=""
  for opt in $NODE_OPTIONS; do
    case "$opt" in
      --import=*)
        file="${opt#--import=}"
        file="${file#file://}"
        if [ -f "$file" ]; then
          result="$result $opt"
        fi
        ;;
      *)
        result="$result $opt"
        ;;
    esac
  done
  echo "${result# }"
}
sanitize_node_options
