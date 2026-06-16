# Architecture Review Lens

Use this file during architect review, critic pressure, and the final post-implementation review.

Start from a hostile prior: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent bugs. Any FAIL must be evidence-backed with file/function/line or equivalent precise location, and explain why existing tests/checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.

## What to check

### 1. Decision integrity
- Is there a real architecture decision, or only a cleaned-up snapshot of the current repo?
- Are rejected alternatives and tradeoffs explicit?
- Did the workflow stop for approval before canonical artifacts were written?

### 2. C4 completeness
- Are Context, Container, and Component/Module views all present?
- Do the diagrams or text views explain relationships clearly enough to guide change?
- Did the package avoid skipping C4 because "the code already shows it"?

### 3. DDD quality
- When domain boundaries matter, are strategic artifacts present and concrete?
- Are bounded contexts, language, context map, and ownership explicit?
- Is tactical DDD used selectively where real invariants exist?
- Did the package avoid cargo-cult entities, aggregates, and repositories?

### 4. Dependency and seam clarity
- Is the dependency rule explicit where Clean Architecture or Ports & Adapters is used?
- Is the import-export map clear enough to show what imports/exports what and who owns each exposed seam?
- Are binding `must_not_import` rules stated for no-go imports that would break the architecture?
- Are inbound/outbound ports and adapters real, or decorative?
- For existing-codebase improvement, does each new seam have real variation or at least a credible second adapter?
- Is composition root / DI shape clear enough to implement?

### 4b. Module depth and improvement quality
- Do the proposed or implemented modules increase leverage at the interface?
- Does the change improve locality, or just move the same complexity across more files?
- Would the shallow wrappers fail the deletion test?
- Are tests meant to exercise behavior through the interface rather than past it?

### 5. Artifact boundaries
- Is `ARCHITECTURE.md` the entrypoint and selected product architecture contract rather than the whole universe?
- Does `ARCHITECTURE.md` capture the chosen option, constraints, binding rules, entity delta, boundaries, dependency direction, source-layout/doc deltas, and pointers to local `CONTEXT.md` docs instead of turning into a catalog of options or generic architecture advice?
- Are supporting artifacts justified and linked?
- Are local `CONTEXT.md` docs placed near the folders they govern?
- Are related entities, ports, adapters, and local rules colocated with the owning context instead of being pulled into a central mirror?
- When bounded contexts, ports-and-adapters, Clean Architecture, or equivalent zones are chosen, does source layout make those zones obvious?
- Do local `CONTEXT.md` docs act as the distributed source of truth for ownership, placement, and forbidden dependencies instead of deferring everything upward?

### 6. Migration realism
- Can the migration be sliced into reviewable PRs?
- Does PR slicing state what each slice changes structurally and which architecture checks should pass?
- Are sequencing constraints and high-risk moves named?
- Did the package avoid freezing a fantasy end-state with no path from here to there?

### 7. Proof map and ownership
- When architecture-sensitive triggers are present, does `domain_source_proof_map` cover concept classification, owner context/module, allowed and forbidden paths/layers, runtime/source entrypoints, invariants/lifecycle or non-domain reasons, schema/durable fields owners, compatibility decisions, negative checks, and reviewer gates?
- Did Planner/Implementer preserve Architect-owned classification and ownership rules instead of translating them away?
- Do workflow states, gates, artifacts, approved packets, review verdicts, schemas, and durable records align with the same owner map across source, docs, and tests/checks?

### 8. Naming honesty
- Are projections/read models kept out of `entities` unless they truly meet entity criteria?
- Are snapshot/record wrappers named as records/projections/DTOs instead of entities?
- Are descriptors/debug metadata and adapter/provider details kept out of canonical core-domain language unless the proof map justifies them?

### 9. Fake modules and deletion proof
- Does each module/source zone own behavior, contract, policy, or runtime responsibility?
- Is runtime usage shown, and does the deletion test say what breaks if the path is removed?
- Fail folder theater: a folder that exists for one port, one wrapper, or no owned behavior needs a temporary migration exception or deletion.

### 10. Compatibility deletion
- Are deprecated re-exports, wrappers, aliases, and legacy import paths deleted now or captured with owner, expiry/removal condition, and imports to update?
- Do negative checks prove forbidden compatibility imports/paths are absent when deletion was required?

### 11. Failure-mode pressure
- Was any artifact written too early?
- Did the package collapse into as-is documentation?
- Was DDD reduced to buzzwords?
- Was everything centralized into one mega-doc?
- Were forbidden dependencies and ownership rules left implicit?
- Did the improvement add indirection without depth, locality, or test-surface clarity?
- Did the package claim bounded contexts, ports-and-adapters, Clean Architecture, or equivalent zones while source layout still hides major responsibilities in flat/global modules?

## Typical failures

- architecture style chosen by taste instead of pressure
- proposal artifact skipped or too weak to approve against
- ADR present but no C4
- C4 present but no decision or migration logic
- strategic DDD needed but omitted
- tactical DDD sprayed everywhere
- ports/adapters vocabulary with no real dependency rule
- `CONTEXT.md` replaced by a centralized folder dump
- central docs mirroring local ownership rules instead of routing to the owning context
- `ARCHITECTURE.md` turned into an encyclopedia of architecture options, heuristics, or generic best practices instead of the selected contract
- pass-through module extraction presented as architecture improvement
- PR slicing too vague to guide implementation
- missing entity delta, import-export/dependency map, binding no-go imports, source-layout/doc deltas, or checks needed to review the proposal
- green tests used as a substitute for path-level proof, negative checks, compatibility deletion, fake-module pressure, naming honesty, or schema/domain ownership alignment

## Final gate

Do not call the result clean if it still reads like architecture theater.

Do not call the result clean until source, tests/checks, docs/architecture artifacts, local context docs, state-machine/workflow records, schemas, and artifact maps agree on every changed contract-bearing surface.

For triggered architecture-sensitive work, final review must also state whether proof map, negative checks, compatibility surfaces, fake modules, naming honesty, and schema/domain alignment passed.
