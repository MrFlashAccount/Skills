# Relationships

Relationships describe how structural entities call, depend on, publish to, translate for, compose with, import from, export to, or govern each other.

Name both the relationship and its direction. `A adapts B` is stronger than `A and B are related`.

When module/package seams are affected, include an import-export map: what imports what, what exports what, and which structural entity owns each exposed interface or artifact. Keep it architectural; do not list exact code signatures or patch steps.

## Use it when

- multiple structural entities interact across a seam or boundary
- reviewers need to understand who drives whom, who depends on whom, or who translates whose language
- import/export direction is part of the architecture risk or source-layout change

## Do not use it for

- folder adjacency with no architectural meaning
- implementation step lists masquerading as structure
- import-export inventories that merely mirror the current tree without explaining ownership or direction

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
2. Repo canon: `skills/create-architecture/references/language.md`
