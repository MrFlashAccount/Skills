# Frontend Taste Learnings

Reusable taste canon for `Roles/Frontend-Taste`.

Use this folder for portable taste knowledge that should survive across repos.
Do not put repo-specific tokens, component inventories, brand rules, or one-off product exceptions here.

## Read model

Always load:
- `shared-core.md`

If repo design memory is present and declares a project type, then load one primary product-class file based on that declaration:
- `marketing-site.md`
- `dashboard.md`
- `admin-panel.md`
- `docs-site.md`

Load more than one class file only when the repo explicitly declares mixed modes and the current task actually touches the secondary mode.

If the repo has no `DESIGN.md` or no declared `design/project-type.md` yet:
- do not guess the product class
- load `shared-core.md` only
- state that project-class routing is undeclared
- lower confidence for class-specific taste judgments until repo design memory exists

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
