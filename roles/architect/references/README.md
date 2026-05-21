# Architect References Index

Entry point for the Architect reference set.

Use these references selectively. Start here, then open only the docs that materially affect the slice.

## Quick routing by question

- **What architecture weight fits this slice?** → `criteria/architecture-weight.md`
- **Is the right answer DDD because language and boundaries are the problem?** → `patterns/strategic-ddd.md`, `entities/bounded-context.md`, `entities/ubiquitous-language.md`, `formats/context-map.md`
- **Does one context need richer domain mechanics?** → `patterns/tactical-ddd.md`, `entities/invariant.md`
- **Do dependency direction, import-export seams, ports, request paths, or persistence boundaries matter?** → `patterns/clean-architecture.md`, `patterns/ports-and-adapters.md`, `entities/dependency-rule.md`, `entities/relationships.md`
- **Is controlled extensibility the point?** → `patterns/plugin-architecture.md`
- **Can this stay a small functional core with side effects at the edge?** → `patterns/functional-core-shell.md`
- **Should this remain a small monolith or almost no extra architecture?** → `criteria/architecture-weight.md`, `criteria/collocation.md`
- **Who owns this change, what is the entity delta, and what must not move?** → `entities/boundaries-and-ownership.md`, `entities/forbidden-moves.md`, `entities/structural-entity.md`, `entities/relationships.md`
- **Is this architecture-sensitive at all?** → `criteria/change-classification.md`, `criteria/architecture-fit.md`, `criteria/design-basis.md`
- **How should the shape be rendered or recorded?** → `formats/c4-views.md`, `formats/context-map.md`, `formats/adr.md`, `formats/architecture-records.md`
- **What risks or smells deserve explicit callout?** → `criteria/structural-risks.md`, `balanced-coupling.md`

## How this reference set is split

- `entities/` contains stable Architect terms the structural contract names directly.
- `patterns/` contains reusable architecture forms and when they are worth their weight.
- `formats/` contains representation and recording formats for architecture decisions.
- `criteria/` contains classification and judgment lenses that help Architect choose the right shape.
- Some references are intentionally sibling lenses outside that taxonomy when they cut across multiple buckets; `balanced-coupling.md` is one of those, not an orphan.

## Entity references

- `entities/bounded-context.md` — responsibility zones, language protection, and ownership boundaries.
- `entities/ubiquitous-language.md` — stable shared vocabulary for code, docs, tests, and review.
- `entities/boundaries-and-ownership.md` — who owns the behavior, seam, docs, and tests, and where the change must stop.
- `entities/structural-entity.md` — architecture-level units the structural contract reasons about, including entity delta.
- `entities/relationships.md` — directional structural relationships between entities or contexts, including import-export maps when seams are affected.
- `entities/dependency-rule.md` — allowed and forbidden dependency direction, including `must_not_import`, request-path, persistence-boundary, or check pressure when relevant.
- `entities/constraint.md` — binding limits on the solution space.
- `entities/invariant.md` — truths that must remain stable while the slice changes.
- `entities/forbidden-moves.md` — explicit structural no-go changes.
- `entities/structural-contract.md` — binding architecture handoff before execution planning.
- `entities/final-structural-contract.md` — concise planner-facing structural handoff.

## Pattern references

- `patterns/strategic-ddd.md` — when boundary, ownership, and language pressure justify DDD at context level.
- `patterns/tactical-ddd.md` — when a single context needs explicit domain-model mechanics.
- `patterns/clean-architecture.md` — when dependency direction between policy and detail must be explicit.
- `patterns/ports-and-adapters.md` — seam, port, inbound port, outbound port, and adapter guidance kept together.
- `patterns/plugin-architecture.md` — when the core needs a stable extension seam for optional modules.
- `patterns/functional-core-shell.md` — when pure decision logic can stay separate from side effects.

## Format references

- `formats/c4-views.md` — how to describe architecture with C4 zoom levels without drawing ceremony for its own sake.
- `formats/context-map.md` — how to record bounded-context relationships in a `CONTEXT-MAP.md` or equivalent artifact.
- `formats/adr.md` — how to record one architecturally significant decision durably.
- `formats/architecture-records.md` — architecture memory and record-keeping across `ARCHITECTURE.md`, `CONTEXT.md`, ADRs, and related artifacts.

## Criteria references

- `criteria/architecture-weight.md` — when to choose almost no architecture, a small monolith, functional-core shell, ports/adapters, Clean Architecture, plugin architecture, or DDD.
- `criteria/architecture-fit.md` — whether the change matches the repo's intended architectural shape.
- `criteria/change-classification.md` — whether the slice is local, design-level, architecture/structural, or mixed.
- `criteria/collocation.md` — where related rules, adapters, tests, and docs should live.
- `criteria/structural-risks.md` — structural risks plus common smells such as ownership drift, naming drift, and language drift.
- `criteria/design-basis.md` — when ambiguity in done state, ownership, or dependency direction should block architecture guessing.

## Cross-cutting lens

- `balanced-coupling.md` — use when deciding whether a seam, direct dependency, or boundary is justified by strength, distance, and volatility.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/README.md`

Only list this file if it was actually loaded.
