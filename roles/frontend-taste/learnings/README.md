# Frontend Taste Learnings

Reusable taste canon for `roles/frontend-taste`.

Use this folder for portable taste knowledge that should survive across repos.
Do not put repo-specific tokens, component inventories, brand rules, or one-off product exceptions here.

## Read model

First, if the repo has `DESIGN.md` or equivalent design memory, read it as the source of truth. Portable Frontend Taste guidance must not override that local contract.

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
- vague/new/high-impact UI, requests for stylish/beautiful output, or weak `DESIGN.md` direction -> use the Direction Router in `ROLE.md` before picking a path
- references would materially improve direction, craft, density, interaction feel, or confidence -> optionally use Reference Scout in `ROLE.md`; extract principles from 3-5 references, do not copy
- “what layout/pattern should this use?” -> `patterns-*.md`
- “how should nav behave or be composed here?” -> `patterns-navigation.md`
- “how should type carry this surface?” -> `patterns-typography.md`
- “how should imagery/gallery structure work here?” -> `patterns-media-and-galleries.md`
- “what is absolutely not allowed here?” -> `anti-patterns.md`
- “what feels suspicious or cheap?” -> `bad-smells.md`
- “show me what stronger vs weaker looks like” -> `examples.md`

If the repo has no `DESIGN.md` or no declared `design/project-type.md` yet:
- do not guess the product class
- for lightweight taste review only, load `shared-core.md` only
- state that design/project-class routing is undeclared
- lower confidence for class-specific taste judgments until repo design memory exists
- route to `create-design` before creating/changing design law, product basis, palette, typography, layout, density, motion law, or high-confidence screen direction
- in Create Design flows, help close the base product, audience, requirements, product type, key action, trust posture, density, emotional tone, reference, and state questions needed to create or update `DESIGN.md`

## Design creation support

This library is not only for post-hoc review. When a calling Create Design-style flow is creating `DESIGN.md`, Frontend Taste can act as a design architect for the visual/design-context parts: ask for missing context, challenge generic assumptions, and turn closed answers into durable repo design memory. The actual create-design/dev-harness wiring lives outside this folder.

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
