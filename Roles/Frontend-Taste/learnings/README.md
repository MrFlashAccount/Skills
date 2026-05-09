# Frontend Taste Learnings

Reusable taste canon for `Roles/Frontend-Taste`.

Use this folder for portable taste knowledge that should survive across repos.
Do not put repo-specific tokens, component inventories, brand rules, or one-off product exceptions here.

## Read model

Always load:
- `shared-core.md`

Then load one primary product-class file based on repo-declared project type:
- `marketing-site.md`
- `dashboard.md`
- `admin-panel.md`
- `docs-site.md`

Load more than one class file only when the repo explicitly declares mixed modes and the current task actually touches the secondary mode.

## Boundary

Belongs here:
- portable taste heuristics
- reusable visual quality rules
- cross-repo anti-patterns
- product-class-specific taste patterns that repeat across many repos

Does not belong here:
- repo tokens
- repo component rules
- repo interaction rules
- brand-specific references
- one-off local exceptions

Those belong in repo-level design memory routed by `DESIGN.md`.
