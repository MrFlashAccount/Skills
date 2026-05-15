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

If `DESIGN.md` is absent, weak, contradictory, or has no project-type router, lightweight taste review may use only `shared-core.md`, state that design routing is undeclared, and lower class-specific confidence. Route to `create-design` before creating/changing design law, product basis, audience, visual direction, palette, typography, layout, density, motion rules, constraints, or high-confidence screen direction. Frontend Taste must not invent those from portable learnings.

For new screen/design work inside an existing design law, run Reference Scout, produce 3-4 product-tied Frontend-Taste proposals, critique them as needed, let Sergey choose/combine/reject, then proceed to detail/spec/implementation support. This is Frontend Taste role behavior inside design law, not the `create-design` process. Create-design reference/direction loops use exactly 3 references/options per round before writing durable design memory.

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

Reference contracts:
- `references/evidence-notes.md`
- `references/visual-proposal-contract.md`
- `references/quality-criteria.md`
- `references/project-routing.md`

Pressure / examples:
- `learnings/anti-patterns.md`
- `learnings/bad-smells.md`
- `learnings/examples.md`

## Entries

- v1 split: reusable taste canon moved into `learnings/` so `Frontend-Taste` can route by project type instead of loading one monolithic file.
- v2 expansion: pattern families, anti-patterns, bad-smells, and examples now live inside `roles/frontend-taste` itself instead of a separate repo-level pattern library.
- v3 design-contract direction: `DESIGN.md` is explicit source of truth; local design law has priority over portable Frontend Taste canon.
- v4 direction/reference repair: vague/new/high-impact UI must route through product-tied Frontend-Taste proposals inside existing design law; Reference Scout extracts principles from references; anti-slop, honest placeholder, restrained motion, density, and cliche checks are first-class local review pressure.
- v5 process-vs-role boundary: mirror `create-architecture` vs Architect. `create-design` is the workflow/process that authors or repairs design-memory artifacts, especially `DESIGN.md`; Frontend Taste is the role that operates inside existing design law for concrete screens/states/components. It may attack or criticize `DESIGN.md` and say `create-design` is needed, but must not silently rewrite or invent design law. With no design router, lightweight taste review may stop at `shared-core.md` with undeclared routing and lower class-specific confidence; creating/changing design law or high-confidence direction routes to `create-design`. For new taste-sensitive screens it reads `DESIGN.md`, runs Reference Scout, offers 3-4 screen-level proposals, may critique before choice, and waits for Sergey to choose/combine/reject before detail/spec/implementation work.
- v6 evidence/boundary repair: internal process canon, WCAG-style accessibility floor, and optional design-system/reference-bank material are separate layers; Frontend Taste owns visible design symptoms, not CLS/INP/Core Web Vitals or performance diagnosis.
