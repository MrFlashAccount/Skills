# Role Resolution

Use this file to map a user-supplied hat name onto a repo `../../roles/<role>` directory.

## Source of truth

Resolve roles by calling `scripts/resolve-role.sh <role>` from the hat skill root. The script normalizes only trivial spaces/slashes-to-kebab slug input, checks the direct repo path `../../roles/<role>/ROLE.md`, and prints deterministic concrete paths for the requested role. It does not scan all roles, fuzzy-match, or invent aliases.

For displaying the full available role list, call `scripts/list-roles.sh` from the hat skill root. The script reads `ROLE.md` frontmatter and prints deterministic `name - description` lines.

`resolve-role.sh` output fields:
- `role: <role>`
- `role_file: roles/<role>/ROLE.md`
- `rubric_file: roles/<role>/RUBRIC.md` when it exists

## Resolution rules

- call `scripts/resolve-role.sh <role>` first
- the script resolves a direct role slug only
- spaces and slashes may normalize to the same kebab-case slug
- if the script reports no match, tell the user the role is not present and offer `scripts/list-roles.sh`

## Examples

Likely valid:
- `hat <frontmatter-name-from-ROLE.md>`
- `hat <role-directory-name>`
- `hat <normalized role name using spaces or slashes>`

Invalid:
- any partial, abbreviated, category-like, or otherwise non-existent slug

## Loading rule

Loading a hat is not just naming a role.

You must:
- load the `role_file` and `rubric_file` paths printed by `scripts/resolve-role.sh <role>`
- follow the role's local read model when it says to load supporting files
- respect repo design memory or architecture memory when that role depends on it

Example:
- a loaded role may require additional supporting files depending on the task; discover those by following the loaded role files, not by hardcoding role-internal paths here

## Missing role behavior

If the role is not present:
- say the repo does not currently have that role
- offer the available role list from `scripts/list-roles.sh`
- do not fabricate, fuzzy-match, or alias a role silently
