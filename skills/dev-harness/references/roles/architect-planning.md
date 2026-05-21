# Architect Planning Overlay

Paths in this compact role/focus guidance are resolved relative to the `dev-harness` skill root (`skills/dev-harness/`), not relative to this reference file.

Use this for the existing `dev-harness` planning-time architecture gate when scope is architecture-sensitive, and for tiny slices whenever durable architecture-artifact ownership might move. Full architecture process/package work routes to `create-architecture`; do not use this overlay as a substitute for that workflow.

Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first, then follow the loaded role files for any additional architecture references.

This is a phase-specific overlay for execution planning, not post-implementation review and not a parallel ceremony.

## Purpose

Use Architect during planning when the main risk is structural, not merely factual discovery:

- unclear target architecture or file-zone boundaries
- unclear request-path or module seams
- dependency shape or layering risk
- likely contract drift across modules
- adapter/seam decisions that could introduce shallow indirection or accidental coupling
- balanced coupling questions where integration strength, distance, or volatility may be mismatched
- uncertainty about whether architecture notes/ADRs/context docs must move with the slice
- evolving requirements that may no longer fit the current source shape without an architecture evolution/refactor slice
- risk that a chosen bounded-context, ports-and-adapters, Clean Architecture, or equivalent shape will be hidden in flat/global modules instead of revealed by source layout

## Required output

Architect output may start with an optional short `summary`. For ordinary architecture-sensitive work, the required body order is:

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

When the slice touches architecture-artifact ownership, source layout, runtime paths, schemas/domains, compatibility behavior, migration/deletion, or reviewer proof handoff, Architect must also include the triggered proof/handoff fields below, placed before `structural_risks`:

- `domain_source_proof_map`
- `source_layout_owner_map`
- `runtime_path_map`
- `schema_domain_ownership_map`
- `compatibility_surface_plan`
- `deletion_migration_plan`
- `forbidden_placements_imports`
- `verification_surfaces`
- `reviewer_gates`
- `known_exceptions_with_expiry`

These fields are trigger-based, not ceremony. For tiny/local tasks without the relevant architecture-sensitive surface, omit the field or mark it `not_applicable` / `n/a_with_reason`; do not force full proof maps where no structural handoff exists.

For new project, new repo, new plugin, and architecture-sensitive work, `project_baseline` records existing docs, current and target source ownership zones, and relevant missing/deferred artifacts. `architecture_artifact_manifest` names the durable artifacts in play: `ARCHITECTURE.md`, meaningful source-zone `CONTEXT.md`, ADR/migration docs as needed, and `DESIGN.md` status when UI/frontend surface is material. Source-focused `CONTEXT.md` defaults only to meaningful source ownership zones, not tests/scripts/fixtures/tooling by default.

`domain_source_proof_map`, `source_layout_owner_map`, `runtime_path_map`, and `schema_domain_ownership_map` connect domain concepts, ownership zones, runtime entry/path assumptions, and schema authority to durable architecture/source locations. `compatibility_surface_plan`, `deletion_migration_plan`, and `forbidden_placements_imports` state structural constraints for safe change, backward compatibility, removals/migrations, and prohibited fake/flat/global placements. `verification_surfaces`, `reviewer_gates`, and `known_exceptions_with_expiry` define reviewable proof surfaces, role-specific gates, and bounded exceptions for downstream implementation/review.

`constraints` and `final_structural_contract` must name the target architecture for the slice, including any architecture evolution/refactor that must happen before feature implementation.

`required_artifacts` must include one explicit architecture artifact decision:

- `none`: no durable architecture artifact create/update is required for this slice.
- `update_existing`: update an existing artifact before implementation handoff; name it.
- `create_new`: create a new durable project artifact before implementation handoff; name intended type/location or the decision still needed.

When an artifact is required, Architect owns the create/update decision before implementation handoff by default. Architect may also be assigned as the architecture artifact implementer owner for approved artifacts, distinct from architect review and from backend/frontend code owners.

## Dual-pass architecture

For architecture-sensitive work:

1. `Architect A propose`: drafts the constraints-first structural contract.
2. `Architect B attack`: challenges constraints, forbidden moves, invariants, boundaries and ownership, structural entities, relationships, dependency rules, project baseline, architecture artifact manifest, required artifacts, any triggered proof/handoff fields, structural risks, and final structural contract. The attack must specifically check that triggered proof/handoff fields are present, scoped, evidence-oriented, and not replaced by implementation recipes; missing fields are acceptable only with `not_applicable` / `n/a_with_reason` tied to the slice trigger.
3. Allow one bounded revise/re-review loop when the attack finds fixable gaps, unless the caller explicitly approves another.

This is the same Architect role/class in an attack pass, not a separate Critic role/entity.

## Planning-safe content

Return only planning-safe material:

- constraints, including target architecture and any required architecture evolution/refactor pressure
- forbidden moves
- invariants
- boundaries and ownership, including source-layout expectations
- structural entities
- relationships
- dependency rules
- project baseline and architecture artifact manifest when required
- required architecture artifacts and artifact decision
- triggered Architect-owned structural/proof constraints: domain/source proof, source-layout ownership, runtime paths, schema/domain ownership, compatibility surface, deletion/migration constraints, forbidden placements/imports, verification surfaces, reviewer gates, and known exceptions with expiry
- structural risks
- final structural contract

The proof/handoff fields are planning-safe only when they state structural ownership, evidence surfaces, constraints, or review gates. They must not become implementation recipes, patch plans, command lists, or Planner-owned entity maps.

If review pressure matters, capture it inside `verification_surfaces`, `reviewer_gates`, `structural_risks`, or `final_structural_contract`, not as ad-hoc top-level slots. Assumptions that materially constrain the slice belong in `constraints`, the triggered proof/handoff fields, or `structural_risks`.

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
- implementation entity maps owned by Planner; Architect-owned proof/handoff maps must remain structural and evidence-focused
- broad redesign outside approved scope
- full architecture package workflow that belongs in `create-architecture`

## Decision rule

### Architecture gate is mandatory when:

- the slice is `non-trivial` and architecture-sensitive
- the slice introduces or reshapes adapters, service boundaries, structural entities, or contract-touchpoint seams
- the slice could quietly change architecture records, module ownership, source layout, or durable architecture memory if left unchecked
- the work is for a new project, new repo, or new plugin and needs a baseline before implementation planning
- a durable architecture artifact may need to be created or updated, even if the slice is otherwise tiny
- the next feature slice would put a major new responsibility into a flat/global module because the current architecture has not evolved to fit the requirement

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
- Planning Architect must describe/evolve the target architecture, not merely validate local seams.
- When current architecture no longer fits evolving requirements, propose an architecture evolution/refactor slice before implementation planning adds feature debt.
- Screaming architecture is binding when selected: chosen contexts, ports/adapters, policy/detail layers, and owning zones must be visible in source layout unless the contract records an explicit exception.
- Keep Researcher domain vocabulary, Architect structural entities, and Planner implementation entities distinct.
- If the real issue is still open-ended discovery/proposal, send it back to `research` instead of stretching planning to absorb it.
