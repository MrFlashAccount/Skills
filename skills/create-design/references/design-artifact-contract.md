# Design Artifact Contract

Use this file to decide what the design-memory system must ship.

## Required core

Always require:
- `DESIGN.md`

`DESIGN.md` is the entrypoint artifact. It must tell a downstream reader what the design law is and where any supporting docs live.

## Optional supporting artifacts

Only add these when they remove real ambiguity, bloat, or drift:
- `design/tokens.md`
- `design/patterns/*.md`
- `design/sections/*.md`
- `design/motion.md`
- `design/refs/*.md`
- `design/decisions/*.md`
- `design/brand.md`

## Add a supporting doc when

- `DESIGN.md` would otherwise become too bulky to operate from
- one concern has enough stable rules to deserve its own boundary
- downstream readers would likely misapply the doctrine without a dedicated doc
- a sub-surface needs reusable rules that should not stay buried in one section of `DESIGN.md`

## Do not add a supporting doc when

- it only repeats content already clear in `DESIGN.md`
- it exists only because another repo had a similar file
- it carries vague inspiration instead of operational rules
- the scope is so small that a single document is cleaner

## Artifact map rule

If supporting docs exist, `DESIGN.md` must link them explicitly and state what each one is for.

## Refs rule

Refs are allowed as support material.
They do not replace design doctrine.
Do not let image refs become the only place where key design rules live.
