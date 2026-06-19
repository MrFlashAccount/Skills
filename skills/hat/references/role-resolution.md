# Role Resolution

Use this file to map a user-supplied hat name onto repo `../../roles/*`.

## Source of truth

Resolve roles by calling `scripts/resolve-role.sh <role>` from the hat skill root. The script reads repo `../../roles/*/ROLE.md` frontmatter and prints deterministic concrete paths for the requested role.

For displaying the full available role list, call `scripts/list-roles.sh` from the hat skill root. The script reads `ROLE.md` frontmatter and prints deterministic `name - description` lines.

`resolve-role.sh` output fields:
- `role: <role>`
- `role_file: roles/<role>/ROLE.md`
- `rubric_file: roles/<role>/RUBRIC.md` when it exists

## Resolution rules

- call `scripts/resolve-role.sh <role>` first
- the script matches exact frontmatter names and directory names before normalized lowercase / kebab-case / space / punctuation variants
- if the script reports no match, tell the user the role is not present and offer `scripts/list-roles.sh`
- if the script reports ambiguity, do not guess; ask which one the user wants

## Examples

Likely valid:
- `hat architect`
- `hat critic`
- `hat frontend`
- `hat frontend-taste`
- `hat frontend taste`
- `hat privacy/data-safety`
- `hat techwriter`

Potentially ambiguous:
- `hat front`
- `hat writer`
- `hat perf`

## Loading rule

Loading a hat is not just naming a role.

You must:
- load the `role_file` and `rubric_file` paths printed by `scripts/resolve-role.sh <role>`
- follow the role's local read model when it says to load supporting files
- respect repo design memory or architecture memory when that role depends on it

Example:
- `Frontend-Taste` may require additional supporting files depending on the task; discover those by following the loaded role files, not by hardcoding role-internal paths here

## Missing role behavior

If the role is not present:
- say the repo does not currently have that role
- offer the closest available role names
- do not fabricate or alias a role silently
