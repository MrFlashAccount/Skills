# Frontend Taste Learnings

Index and durable memory entrypoint for the Frontend Taste role.

## How to use this file

Use this file as:
- a short index into `learnings/`
- a place for durable meta-notes about how the taste canon evolves
- a carry-forward log for reusable corrections that do not belong in one project-class file alone

Primary reusable taste guidance lives in `learnings/*.md`, not in this file.

## Reading order

1. `learnings/README.md`
2. `learnings/shared-core.md`
3. one project-class file routed by repo design memory
4. only the additional pattern / anti-pattern / example files relevant to the current surface or question

## Library layout

Canonical corpus:
- `learnings/shared-core.md`
- `learnings/marketing-site.md`
- `learnings/dashboard.md`
- `learnings/admin-panel.md`
- `learnings/docs-site.md`

Only `shared-core.md` is always-load. Project-class files are routed selectively.

Pattern library:
- `learnings/patterns-layouts.md`
- `learnings/patterns-navigation.md`
- `learnings/patterns-typography.md`
- `learnings/patterns-cards-and-containers.md`
- `learnings/patterns-states.md`
- `learnings/patterns-motion.md`

Pressure / examples:
- `learnings/anti-patterns.md`
- `learnings/bad-smells.md`
- `learnings/examples.md`

## Entries

- v1 split: reusable taste canon moved into `learnings/` so `Frontend-Taste` can route by project type instead of loading one monolithic file.
- v2 expansion: pattern families, anti-patterns, bad-smells, and examples now live inside `Roles/Frontend-Taste` itself instead of a separate repo-level pattern library.
