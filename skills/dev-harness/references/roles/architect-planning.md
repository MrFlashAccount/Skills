# Architect Planning Adapter

Use this for every mandatory `dev-harness` planning-time `architect` pass, and for tiny slices whenever durable architecture-artifact ownership might move.

Load `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, and `roles/architect/references/balanced-coupling.md` first.

This is a phase-specific adapter for execution planning, not post-implementation review.

## Purpose

Use `architect` during planning when the main risk is structural, not merely factual discovery:
- unclear file-zone boundaries
- unclear request-path or module seams
- dependency shape or layering risk
- likely contract drift across modules
- adapter/seam decisions that could introduce shallow indirection or accidental coupling
- balanced-coupling questions where integration strength, distance, or volatility may be mismatched
- uncertainty about whether architecture notes/ADRs/context docs must move with the slice

## Required output

Return only planning-safe material:
- recommended file-zone boundaries
- ownership/seam notes
- contract-touchpoint risks
- dependency/layering risks
- required architecture-note or ADR/context updates
- one explicit architecture-artifact decision: none required, update existing artifact, or create new durable project artifact
- when an artifact is required, a note that the Architect owns that create/update before implementation handoff by default
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
- the slice is `non-trivial`
- the slice introduces or reshapes adapters, service boundaries, or contract-touchpoint seams
- the slice could quietly change architecture records, module ownership, or durable architecture memory if left unchecked
- a durable architecture artifact may need to be created or updated, even if the slice is otherwise tiny

### `architect` is recommended when:
- the slice is tiny but there is still meaningful coupling or boundary doubt, without yet crossing the mandatory artifact/ownership threshold
- the task is framed as refactor, platforming, cleanup, or “make this structure sane” rather than a narrow bugfix

### `architect` is usually not needed when:
- the slice is a tiny, obvious, single-zone fix with no new seam, no ownership ambiguity, no architecture-memory impact, and no contract/layering risk
- the task is isolated frontend polish or a narrow UI correctness fix with no backend/module-boundary change

## Guardrails

- Stay read-only.
- Stay inside approved scope.
- Convert architecture concerns into contract constraints, not broad redesign.
- If the real issue is still open-ended discovery/proposal, send it back to `research` instead of stretching planning to absorb it.
