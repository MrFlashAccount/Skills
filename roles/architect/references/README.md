# Architect References Index

Entry point for the Architect reference set.

Use these references selectively. Start here, then open only the docs that materially affect the slice.

## How this reference set is split

- `entities/` contains true Architect terms: stable concepts the structural contract names directly.
- `patterns/` contains architecture forms: reusable shapes such as Clean Architecture or ports-and-adapters.
- Some references are intentionally sibling lenses outside that taxonomy when they cut across both buckets; `balanced-coupling.md` is one of those, not an orphan.
- Keep this distinction sharp. Do not explode every pattern into one file per inner concept unless that term genuinely needs its own durable Architect reference.

## Entity references

- `entities/bounded-context.md` — responsibility zones, language protection, and ownership boundaries.
- `entities/ubiquitous-language.md` — stable shared vocabulary for code, docs, tests, and review.
- `entities/structural-entity.md` — architecture-level units the structural contract reasons about.
- `entities/dependency-rule.md` — allowed and forbidden dependency direction.
- `entities/constraint.md` — binding limits on the solution space.
- `entities/invariant.md` — truths that must remain stable while the slice changes.
- `entities/structural-contract.md` — binding architecture handoff before execution planning.
- `entities/final-structural-contract.md` — concise planner-facing structural handoff.

## Pattern references

- `patterns/clean-architecture.md` — when to use Clean Architecture dependency language and how heavy it should be.
- `patterns/ports-and-adapters.md` — seam, port, and adapter guidance kept together as one pattern/form reference.

## Cross-cutting lens

- `balanced-coupling.md` — use when deciding whether a seam, direct dependency, or boundary is justified by strength, distance, and volatility.
