# Change Classification

Change classification decides how much architecture involvement the slice deserves.

## Useful buckets

- **local** — stays within one owned module or context, with no architecture record pressure
- **design-level** — changes an interface or seam inside existing ownership
- **architecture/structural** — changes boundaries, ownership, dependency rules, runtime shape, or durable architecture records
- **mixed** — implementation work with a real structural side effect

Use this to right-size the architecture pass instead of treating every edit like a redesign.

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add it to the final role evidence loaded list as:

- `roles/architect/references/criteria/change-classification.md`

Only list this file if it was actually loaded.
