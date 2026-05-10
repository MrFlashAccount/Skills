# Architect Planning Adapter

Use this only when `dev-harness` selected an explicit planning-time `architect` pass.

Load `roles/architect/ROLE.md` and `roles/architect/RUBRIC.md` first.

This is a phase-specific adapter for execution planning, not post-implementation review.

## Purpose

Use `architect` during planning when the main risk is structural, not merely factual discovery:
- unclear file-zone boundaries
- unclear request-path or module seams
- dependency shape or layering risk
- likely contract drift across modules
- adapter/seam decisions that could introduce shallow indirection or accidental coupling
- uncertainty about whether architecture notes/ADRs/context docs must move with the slice

## Required output

Return only planning-safe material:
- recommended file-zone boundaries
- ownership/seam notes
- contract-touchpoint risks
- dependency/layering risks
- required architecture-note or ADR/context updates
- recommended review roles
- explicit unknowns or assumptions

Do not return:
- code
- pseudocode
- edit recipes
- exact signatures
- migration commands
- patch-like diffs
- broad redesign outside approved scope

## Decision rule

### `architect` is mandatory when:
- the slice is `non-trivial` and spans multiple backend file zones or modules
- request-path boundaries, ownership, or dependency direction are not already obviously closed
- the slice introduces or reshapes adapters, service boundaries, or contract-touchpoint seams
- the slice could quietly change architecture records or module ownership if left unchecked

### `architect` is recommended when:
- the slice is backend-heavy but mostly one zone, yet contract drift, rollout shape, or coupling risk is non-trivial
- the task is framed as refactor, platforming, cleanup, or “make this structure sane” rather than a narrow bugfix
- research is closed, but the execution plan still feels structurally ambiguous

### `architect` is usually not needed when:
- the slice is a tiny, obvious, single-zone fix with no new seam, no ownership ambiguity, and no contract/layering risk
- the task is isolated frontend polish or a narrow UI correctness fix with no backend/module-boundary change
- the approved file zone and request-path shape are already explicit and boring

## Guardrails

- Stay read-only.
- Stay inside approved scope.
- Convert architecture concerns into contract constraints, not broad redesign.
- If the real issue is still open-ended discovery/proposal, send it back to `research` instead of stretching planning to absorb it.
