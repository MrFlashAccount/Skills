#!/bin/sh
# Resolve a user-supplied hat role slug to concrete repo role files.
set -eu

usage() {
  echo "usage: $0 <role>" >&2
}

normalize_slug() {
  # Keep resolution direct: normalize only trivial user input forms to a slug,
  # then check the corresponding roles/<slug> files. Do not scan or fuzzy-match.
  printf '%s\n' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed 's#[[:space:]/][[:space:]/]*#-#g; s/^-//; s/-$//'
}

if [ "$#" -ne 1 ] || [ -z "${1:-}" ]; then
  usage
  exit 2
fi

query=$1
role=$(normalize_slug "$query")

case "$role" in
  ""|.|..|*[^a-z0-9-]*)
    echo "invalid role: $query" >&2
    exit 2
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
role_file=roles/$role/ROLE.md
rubric_file=roles/$role/RUBRIC.md

if [ ! -f "$repo_root/$role_file" ]; then
  echo "role not found: $query" >&2
  echo "Expected file: $role_file" >&2
  echo "Use scripts/list-roles.sh to list available roles." >&2
  exit 1
fi

printf 'role: %s\n' "$role"
printf 'role_file: %s\n' "$role_file"

if [ -f "$repo_root/$rubric_file" ]; then
  printf 'rubric_file: %s\n' "$rubric_file"
fi
