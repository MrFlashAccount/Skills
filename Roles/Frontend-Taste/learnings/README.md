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

Then load only the additional support files that materially help the current judgment or generation task:
- pattern files when the question is about pattern choice, structure, or alternatives
- `anti-patterns.md` when the task needs hard prohibitions
- `bad-smells.md` when the task needs softer pressure or “avoid by default” guidance
- `examples.md` when the task needs contrastive good-vs-bad framing

Quick routing:
- “what layout/pattern should this use?” -> `patterns-*.md`
- “how should nav behave or be composed here?” -> `patterns-navigation.md`
- “how should type carry this surface?” -> `patterns-typography.md`
- “what is absolutely not allowed here?” -> `anti-patterns.md`
- “what feels suspicious or cheap?” -> `bad-smells.md`
- “show me what stronger vs weaker looks like” -> `examples.md`

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
- pattern families that repeat across many repos
- examples and bad-smell guidance that improve taste judgment across repos

Does not belong here:
- repo tokens
- repo component rules
- repo interaction rules
- brand-specific references
- one-off local exceptions

Those belong in repo-level design memory routed by `DESIGN.md`.
