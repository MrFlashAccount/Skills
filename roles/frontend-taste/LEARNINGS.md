# Frontend Taste Learnings

Index and durable memory entrypoint for the Frontend Taste role.

## How to use this file

Use this file as:
- a short index into `learnings/`
- a place for durable meta-notes about how the taste canon evolves
- a carry-forward log for reusable corrections that do not belong in one project-class file alone

Primary reusable taste guidance lives in `learnings/*.md`, not in this file.

## Reading order

1. Repo `DESIGN.md` or equivalent design contract when present; it has priority over portable learnings.
2. `ROLE.md`
3. `RUBRIC.md`
4. `learnings/README.md`
5. `learnings/shared-core.md`
6. One project-class file routed by repo design memory
7. Only the additional pattern / anti-pattern / example files relevant to the current surface or question

If `DESIGN.md` is absent, weak, or contradictory, route to `create-design` before project-specific taste judgment. Frontend Taste must not invent product basis, audience, visual direction, palette, typography, layout, density, motion rules, constraints, or design law from portable learnings.

For new screen/design work inside an existing design law, run Reference Scout, produce 3-4 visual proposals, let Sergey choose/combine/reject, then proceed to detail/spec/implementation support. This is role behavior inside design law, not the `create-design` process.

## Library layout

Canonical corpus:
- `learnings/shared-core.md`
- `learnings/marketing-site.md`
- `learnings/dashboard.md`
- `learnings/admin-panel.md`
- `learnings/docs-site.md`

Only `shared-core.md` is always-load after `DESIGN.md` and the role/rubric. Project-class files are routed selectively.

Pattern library:
- `learnings/patterns-layouts.md`
- `learnings/patterns-navigation.md`
- `learnings/patterns-typography.md`
- `learnings/patterns-cards-and-containers.md`
- `learnings/patterns-media-and-galleries.md`
- `learnings/patterns-states.md`
- `learnings/patterns-motion.md`

Pressure / examples:
- `learnings/anti-patterns.md`
- `learnings/bad-smells.md`
- `learnings/examples.md`

## Entries

- v1 split: reusable taste canon moved into `learnings/` so `Frontend-Taste` can route by project type instead of loading one monolithic file.
- v2 expansion: pattern families, anti-patterns, bad-smells, and examples now live inside `roles/frontend-taste` itself instead of a separate repo-level pattern library.
- v3 design-contract direction: `DESIGN.md` is explicit source of truth; local design law has priority over portable Frontend Taste canon.
- v4 direction/reference repair: vague/new/high-impact UI must route through product-tied directions; Reference Scout extracts principles from references; anti-slop, honest placeholder, restrained motion, density, and cliche checks are first-class review pressure.
- v5 process-vs-role boundary: mirror `create-architecture` vs Architect. `create-design` is the workflow/process that authors or repairs design-memory artifacts, especially `DESIGN.md`; Frontend Taste is the role that operates inside existing design law for concrete screens/states/components. It may attack or criticize `DESIGN.md` and say `create-design` is needed, but must not silently rewrite or invent design law. For new taste-sensitive screens it reads `DESIGN.md`, runs Reference Scout, offers 3-4 screen-level proposals, and waits for Sergey to choose/combine/reject before detail work.
