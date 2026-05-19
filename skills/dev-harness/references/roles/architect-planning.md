# Architect Planning Overlay

Paths in this phase overlay are resolved relative to the `dev-harness` skill root (`skills/dev-harness/`), not relative to this reference file.

Use this for the existing `dev-harness` planning-time architecture gate when scope is architecture-sensitive, and for tiny slices whenever durable architecture-artifact ownership might move. Full architecture process/package work routes to `create-architecture`; do not use this overlay as a substitute for that workflow.

Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first, then follow the loaded role files for any additional architecture references.

This is a phase-specific overlay for execution planning, not post-implementation review and not a parallel ceremony.

## Purpose

Use Architect during planning when the main risk is structural, not merely factual discovery:

- unclear file-zone boundaries
- unclear request-path or module seams
- dependency shape or layering risk
- likely contract drift across modules
- adapter/seam decisions that could introduce shallow indirection or accidental coupling
- balanced coupling questions where integration strength, distance, or volatility may be mismatched
- uncertainty about whether architecture notes/ADRs/context docs must move with the slice

## Required output

Architect output may start with an optional short `summary`. The required body order is:

1. `constraints`
2. `forbidden_moves`
3. `invariants`
4. `boundaries_and_ownership`
5. `structural_entities`
6. `relationships`
7. `dependency_rules`
8. `project_baseline`
9. `architecture_artifact_manifest`
10. `required_artifacts`
11. `structural_risks`
12. `final_structural_contract`

For new project, new repo, new plugin, and architecture-sensitive work, `project_baseline` records existing docs, source ownership zones, and relevant missing/deferred artifacts. `architecture_artifact_manifest` names the durable artifacts in play: `ARCHITECTURE.md`, meaningful source-zone `CONTEXT.md`, ADR/migration docs as needed, and `DESIGN.md` status when UI/frontend surface is material. Source-focused `CONTEXT.md` defaults only to meaningful source ownership zones, not tests/scripts/fixtures/tooling by default.

`required_artifacts` must include one explicit architecture artifact decision:

- `none`: no durable architecture artifact create/update is required for this slice.
- `update_existing`: update an existing artifact before implementation handoff; name it.
- `create_new`: create a new durable project artifact before implementation handoff; name intended type/location or the decision still needed.

When an artifact is required, Architect owns the create/update decision before implementation handoff by default. Architect may also be assigned as the architecture artifact implementer owner for approved artifacts, distinct from architect review and from backend/frontend code owners.

## Dual-pass architecture

For architecture-sensitive work:

1. `Architect A propose`: drafts the constraints-first structural contract.
2. `Architect B attack`: challenges constraints, forbidden moves, invariants, boundaries and ownership, structural entities, relationships, dependency rules, project baseline, architecture artifact manifest, required artifacts, structural risks, and final structural contract.
3. Allow one bounded revise/re-review loop when the attack finds fixable gaps, unless the caller explicitly approves another.

This is the same Architect role/class in an attack pass, not a separate Critic role/entity.

## Planning-safe content

Return only planning-safe material:

- constraints
- forbidden moves
- invariants
- boundaries and ownership
- structural entities
- relationships
- dependency rules
- project baseline and architecture artifact manifest when required
- required architecture artifacts and artifact decision
- structural risks
- final structural contract

If review pressure matters, capture it inside `structural_risks` or `final_structural_contract`, not as extra top-level slots. Assumptions that materially constrain the slice belong in `constraints` or `structural_risks`.

Do not return:

- code
- pseudocode
- algorithms
- edit recipes
- exact signatures
- class/function skeletons
- migration commands or bodies
- command sequences for implementation
- patch-like diffs
- implementation entity maps owned by Planner
- broad redesign outside approved scope
- full architecture package workflow that belongs in `create-architecture`

## Decision rule

### Architecture gate is mandatory when:

- the slice is `non-trivial` and architecture-sensitive
- the slice introduces or reshapes adapters, service boundaries, structural entities, or contract-touchpoint seams
- the slice could quietly change architecture records, module ownership, or durable architecture memory if left unchecked
- the work is for a new project, new repo, or new plugin and needs a baseline before implementation planning
- a durable architecture artifact may need to be created or updated, even if the slice is otherwise tiny

### Architecture gate records `none` when:

- the slice is non-trivial but not architecture-sensitive after inspection
- no structural contract is needed beyond ordinary execution-planning boundaries
- no durable architecture artifact create/update is required

### Architect is recommended when:

- the slice is tiny but there is meaningful coupling or boundary doubt, without yet crossing the mandatory artifact/ownership threshold
- the task is framed as refactor, platforming, cleanup, or “make this structure sane” rather than a narrow bugfix

### Architect is usually not needed when:

- the slice is a tiny, obvious, single-zone fix with no new seam, no ownership ambiguity, no architecture-memory impact, and no contract/layering risk
- the task is isolated frontend polish or narrow UI correctness with no backend/module-boundary change

## Guardrails

- Stay read-only during planning.
- Stay inside approved scope.
- Convert architecture concerns into contract constraints, not broad redesign.
- Keep Researcher domain vocabulary, Architect structural entities, and Planner implementation entities distinct.
- If the real issue is still open-ended discovery/proposal, send it back to `research` instead of stretching planning to absorb it.
