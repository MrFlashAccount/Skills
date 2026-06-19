#!/bin/sh
# Resolve a user-supplied hat role query to concrete repo role files.
set -eu

usage() {
  echo "usage: $0 <role>" >&2
}

normalize() {
  # Lowercase, treat punctuation/separators as hyphens, squeeze repeated hyphens.
  printf '%s\n' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//'
}

strip_yaml_scalar() {
  sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'
}

if [ "$#" -ne 1 ] || [ -z "${1:-}" ]; then
  usage
  exit 2
fi

query=$1
query_lc=$(printf '%s\n' "$query" | tr '[:upper:]' '[:lower:]')
query_norm=$(normalize "$query")

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
roles_dir=$repo_root/roles

if [ ! -d "$roles_dir" ]; then
  echo "roles directory not found: $roles_dir" >&2
  exit 1
fi

tmp=${TMPDIR:-/tmp}/hat-resolve-role.$$
trap 'rm -f "$tmp"' EXIT HUP INT TERM
: > "$tmp"

find "$roles_dir" -mindepth 2 -maxdepth 2 -name ROLE.md -type f | sort | while IFS= read -r role_file; do
  role_dir=$(dirname -- "$role_file")
  role_id=$(basename -- "$role_dir")
  role_rel=${role_file#"$repo_root/"}
  rubric_rel=roles/$role_id/RUBRIC.md
  if [ ! -f "$repo_root/$rubric_rel" ]; then
    rubric_rel=
  fi

  name=$(
    awk '
      BEGIN { in_fm = 0; seen_start = 0 }
      NR == 1 && $0 == "---" { in_fm = 1; seen_start = 1; next }
      seen_start && in_fm && $0 == "---" { exit }
      in_fm && $0 ~ /^name:[[:space:]]*/ {
        sub(/^name:[[:space:]]*/, "", $0)
        print $0
        exit
      }
    ' "$role_file" | strip_yaml_scalar
  )
  [ -n "$name" ] || name=$role_id

  name_lc=$(printf '%s\n' "$name" | tr '[:upper:]' '[:lower:]')
  role_id_lc=$(printf '%s\n' "$role_id" | tr '[:upper:]' '[:lower:]')
  name_norm=$(normalize "$name")
  role_id_norm=$(normalize "$role_id")

  # phase<TAB>role<TAB>role_file<TAB>rubric_file<TAB>matched_value
  if [ "$query_lc" = "$name_lc" ] || [ "$query_lc" = "$role_id_lc" ]; then
    printf 'exact\t%s\t%s\t%s\t%s\n' "$role_id" "$role_rel" "$rubric_rel" "$name" >> "$tmp"
  elif [ "$query_norm" = "$name_norm" ] || [ "$query_norm" = "$role_id_norm" ]; then
    printf 'normalized\t%s\t%s\t%s\t%s\n' "$role_id" "$role_rel" "$rubric_rel" "$name" >> "$tmp"
  fi
done

if grep '^exact	' "$tmp" >/dev/null 2>&1; then
  matches=$(grep '^exact	' "$tmp")
elif grep '^normalized	' "$tmp" >/dev/null 2>&1; then
  matches=$(grep '^normalized	' "$tmp")
else
  echo "role not found: $query" >&2
  echo "Use scripts/list-roles.sh to list available roles." >&2
  exit 1
fi

match_count=$(printf '%s\n' "$matches" | sed '/^$/d' | wc -l | tr -d ' ')
if [ "$match_count" -ne 1 ]; then
  echo "ambiguous role: $query" >&2
  printf '%s\n' "$matches" | awk -F '\t' '{ print "- " $2 }' >&2
  exit 1
fi

printf '%s\n' "$matches" | awk -F '\t' '{
  print "role: " $2
  print "role_file: " $3
  if ($4 != "") {
    print "rubric_file: " $4
  }
}'
