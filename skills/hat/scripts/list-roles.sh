#!/bin/sh
# List repo roles for the hat skill by reading ROLE.md frontmatter.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
roles_dir=$script_dir/../../../roles

if [ ! -d "$roles_dir" ]; then
  echo "roles directory not found: $roles_dir" >&2
  exit 1
fi

find "$roles_dir" -mindepth 2 -maxdepth 2 -name ROLE.md -type f | sort | while IFS= read -r role_file; do
  awk '
    BEGIN { in_fm = 0; seen_start = 0; name = ""; description = "" }
    NR == 1 && $0 == "---" { in_fm = 1; seen_start = 1; next }
    seen_start && in_fm && $0 == "---" {
      if (name != "" && description != "") {
        printf "%s - %s\n", name, description
      }
      exit
    }
    in_fm && $0 ~ /^name:[[:space:]]*/ {
      name = $0
      sub(/^name:[[:space:]]*/, "", name)
      gsub(/^"|"$/, "", name)
      next
    }
    in_fm && $0 ~ /^description:[[:space:]]*/ {
      description = $0
      sub(/^description:[[:space:]]*/, "", description)
      gsub(/^"|"$/, "", description)
      next
    }
  ' "$role_file"
done
