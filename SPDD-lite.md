# SPDD-lite

Thin stage map for non-trivial software work in this repo. Full contracts live in the linked role/skill docs.

## Stage order and gates

1. `research`
   - Chain: `Researcher A -> Researcher B attack -> research wrapper verdict`.
   - Required gate: structured Researcher packet is complete, wrapper verdict says whether downstream ownership may be proposed, and blockers are explicit.
   - Human gate: for non-trivial work, the wrapper verdict is not self-approving. Show the research review packet to the user and wait for explicit approval before starting Architect or execution planning.
   - Canonical links:
     - `roles/researcher/ROLE.md`
     - `roles/researcher/RUBRIC.md`
     - `skills/research-critic/`

2. `architecture` *(conditional)*
   - Use when research or task shape is architecture-sensitive: ownership, seams, dependency direction, durable architecture memory, structural records, or contract boundaries can change.
   - Chain: `Architect A propose -> Architect B attack -> one bounded revise/re-review loop -> structural contract` unless the caller explicitly approves another loop.
   - Required gate: Architect-owned structural contract exists before execution planning.
   - Canonical links:
     - `roles/architect/ROLE.md`
     - `roles/architect/RUBRIC.md`
     - `skills/dev-harness/references/roles/architect-planning.md`

3. `execution plan`
   - Chain: `Planner A propose -> Planner B attack -> one bounded revise/re-review loop -> execution contract` unless the caller explicitly approves another loop.
   - Required gate: implementation entities, owners, verification surfaces, rollback surfaces, and max-detail guardrails are explicit; no code, pseudocode, edit recipes, or patch-like plan leaks into planning.
   - Canonical links:
     - `skills/dev-harness/`
     - `skills/dev-harness/references/task-contract.md`

4. `development`
   - Chain: `Implementation -> smallest meaningful verification`.
   - Required gate: approved execution contract is implemented without reopening broad discovery or widening scope.
   - Canonical link: `skills/implementation-harness/`

5. `review`
   - Chain: `post-implementation review -> fix/re-review loop if needed`.
   - Required gate: implemented slice is judged against approved research, structural contract when present, and execution contract.
   - Canonical link: `skills/code-review-orchestrator/`

## Separation rules

- Research names `domain_vocabulary` / known facts and evidence. It does not own structural entities or implementation entities.
- Architect owns `structural_entities`, relationships, dependency rules, architecture artifact decisions, and the final structural contract.
- Execution planning owns `implementation_entities`, file zones, implementer owners, verification surfaces, and rollback surfaces.
- Development consumes the approved execution contract; it must not silently widen scope.
- Review checks the implemented slice against the approved contracts; it must not reopen broad task research unless a real contradiction or missing implementation-critical fact appears.

## Design-test rule

If UI, interaction behavior, component composition, or detail-sensitive product presentation is materially in scope, research should decide whether a `design-test` is required.

For UI-relevant work, that decision must be resolved before execution-plan approval; `unknown` is only a draft-state placeholder, not an allowed approved-plan status.

When required, execution planning must carry that requirement forward explicitly.

`design-test` means a compact design-readiness artifact that describes:
- intended UI shape
- required components
- critical states and behavior
- notable detail expectations

It is not implementation prose, pixel-perfect mock markup, or a substitute for repo-local design memory.

## Minimal routing

- Small obvious work may compress ceremony, but should still produce a compact execution plan before development and a distinct review step after development.
- Non-trivial work preserves stage boundaries, even when one assistant/session performs multiple stages.
- If a stage is incomplete, stop there instead of leaking unresolved work into the next stage.
