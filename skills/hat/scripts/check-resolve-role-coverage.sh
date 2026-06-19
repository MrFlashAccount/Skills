#!/bin/sh
# Verify resolve-role.sh resolves every current role directory by basename.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
list_roles=$script_dir/list-roles.sh
resolve_role=$script_dir/resolve-role.sh

tmp=${TMPDIR:-/tmp}/hat-resolve-role-coverage.$$
trap 'rm -f "$tmp" "$tmp.list" "$tmp.basenames" "$tmp.out" "$tmp.err"' EXIT HUP INT TERM

"$list_roles" > "$tmp.list"

find "$repo_root/roles" -mindepth 2 -maxdepth 2 -name ROLE.md -type f | sort |
  while IFS= read -r role_file; do
    basename -- "$(dirname -- "$role_file")"
  done > "$tmp.basenames"

count=0
while IFS= read -r role; do
  [ -n "$role" ] || continue
  "$resolve_role" "$role" > "$tmp.out"
  role_file=$(awk -F ': ' '$1 == "role_file" { print $2 }' "$tmp.out")
  rubric_file=$(awk -F ': ' '$1 == "rubric_file" { print $2 }' "$tmp.out")
  if [ "$role_file" != "roles/$role/ROLE.md" ] || [ "$rubric_file" != "roles/$role/RUBRIC.md" ]; then
    echo "unexpected resolved files for role slug: $role" >&2
    cat "$tmp.out" >&2
    exit 1
  fi
  if [ ! -f "$repo_root/$role_file" ] || [ ! -f "$repo_root/$rubric_file" ]; then
    echo "resolved file does not exist for role slug: $role" >&2
    cat "$tmp.out" >&2
    exit 1
  fi
  count=$((count + 1))
done < "$tmp.basenames"

# Representative trivial slug normalization should work without naming any
# specific repo role here. Build aliases from discovered role basenames only.
alias_count=0
while IFS= read -r role; do
  [ -n "$role" ] || continue
  alias=$(printf '%s\n' "$role" | sed 's/-/ /g')
  if [ "$alias" != "$role" ]; then
    "$resolve_role" "$alias" > "$tmp.out"
    alias_count=$((alias_count + 1))
    break
  fi
done < "$tmp.basenames"
if [ "$alias_count" -eq 0 ]; then
  while IFS= read -r role; do
    [ -n "$role" ] || continue
    alias=$(printf '%s\n' "$role" | sed 's/-/\//g')
    if [ "$alias" != "$role" ]; then
      "$resolve_role" "$alias" > "$tmp.out"
      alias_count=$((alias_count + 1))
      break
    fi
  done < "$tmp.basenames"
fi

unknown_role=definitely-unknown-hat-role
if "$resolve_role" "$unknown_role" > "$tmp.out" 2> "$tmp.err"; then
  echo "unknown role unexpectedly resolved" >&2
  cat "$tmp.out" >&2
  exit 1
fi
if ! grep "role not found: $unknown_role" "$tmp.err" >/dev/null 2>&1; then
  echo "unknown role did not return controlled error" >&2
  cat "$tmp.err" >&2
  exit 1
fi

printf 'resolve-role coverage ok: %s role directory basenames, %s dynamic alias checks, unknown-role negative ok\n' "$count" "$alias_count"
