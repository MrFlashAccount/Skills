# Architect Rubric

Derived checklist for the Architect role. `ROLE.md` remains the canonical contract.

## Required body order

Architect output may include an optional short `summary`; the required body order is:

1. `architecture_decision`
2. `ubiquitous_language`
3. `bounded_contexts`
4. `constraints`
5. `forbidden_moves`
6. `invariants`
7. `boundaries_and_ownership`
8. `structural_entities`
9. `relationships`
10. `dependency_rules`
11. `required_artifacts`
12. `structural_risks`
13. `final_structural_contract`

## Checklist

- **Architecture decision**: Is the chosen target architecture style/shape explicit, including when the right choice is intentionally minimal or when the current shape must evolve first?
- **Ubiquitous language**: Are stable code/domain terms named for implementation, tests, and review?
- **Bounded contexts**: Are responsibility zones and source-layout implications clear without forcing DDD theater when the slice is small?
- **Constraints first**: Are binding constraints stated before implementation planning?
- **Forbidden moves**: Are prohibited changes explicit enough to prevent scope creep?
- **Invariants**: Are must-preserve behaviors, contracts, data rules, and architecture truths named?
- **Boundaries and ownership**: Are owning contexts/modules/seams/docs/tests clear?
- **Structural entities**: Are architecture-level modules, contexts, seams, adapters, records, boundaries, or domain structures named with an entity delta (`added`, `changed`, `removed`, or explicitly unchanged where it matters) and without confusing them with Researcher domain vocabulary or Planner implementation entities?
- **Relationships**: Are relationships among structural entities explicit, including import-export relationships when package/module seams are affected?
- **Dependency rules**: Are allowed and forbidden dependency directions concrete enough for planning and review, including binding `must_not_import` rules where no-go imports matter?
- **Required artifacts**: Is the architecture artifact decision one of `none`, `update_existing`, or `create_new`, with target artifacts named when required and source-layout/doc deltas called out?
- **Structural risks**: Are coupling, boundary, naming, rollout, record, PR slicing, checks, and contract risks concrete?
- **Final structural contract**: Is the handoff binding, concise, and ready for execution planning, with source-layout expectations, reviewable PR slicing constraints, and architecture checks where relevant?
- **Clarifying questions**: If change surface, ownership, dependency direction, or done state is underspecified, did Architect ask architecture-relevant questions instead of guessing?
- **Architecture fit**: Does the contract match the intended shape of the system, and did Planning Architect notice when changing requirements require architecture evolution/refactor work before more feature slices?
- **Change classification**: Is the slice local, design-level, architecture/structural, or mixed?
- **Collocation**: Are related entities, ports, adapters, and local rules kept with the owning context instead of pulled into a central mirror?
- **Screaming architecture**: If bounded contexts, ports-and-adapters, Clean Architecture, or equivalent responsibility zones are chosen, does source structure reveal them instead of hiding major responsibilities in flat/global modules?
- **Seam hygiene**: Is each seam earned by real variation? Remember: one adapter is hypothetical; two adapters is real.
- **Depth**: Does the interface create leverage and locality, or is it shallow? Would the module survive the deletion test?
- **Balanced coupling**: Is coupling strength appropriate for architectural distance and volatility?
- **Test surface**: Are tests meant to exercise behavior through the interface instead of reaching past it?
- **DDD / language alignment**: Are names and relationships consistent with domain language and bounded contexts?
- **Dual-pass attack**: For architecture-sensitive work, did Architect B attack constraints, forbidden moves, invariants, boundaries, structural entities, relationships, dependency rules, required artifacts, risks, and final contract?
- **Review contract boundary**: In review mode, did Architect enforce the planning-fixed architecture contract and flag unapproved responsibility placement outside owning source zones instead of inventing a new target layout?
- **Contract/docs drift gate**: In final review/re-review for contract-bearing work, did Architect compare implementation, tests/checks, and docs/architecture/source-contract artifacts for every changed user-visible/runtime contract, artifact, schema, workflow/state-machine record, symbolic lifecycle/status value, or review/process contract?
- **Drift fail condition**: Did Architect fail the review when contract-bearing docs/artifacts/tests/source records disagree with implementation, while not treating trivial non-contract comments as blockers?
- **Explicit drift evidence**: Did the review output list changed surfaces, implementation evidence, tests/checks, docs/artifacts checked, and a drift verdict?
- **Architecture weight**: Did Architect choose appropriately among DDD, Clean Architecture, ports/adapters, plugin architecture, functional-core shell, small monolith, or almost no architecture?
- **Code/structure terms**: Does the output speak in modules, ports, adapters, plugin entrypoints, classes/functions/components, dependencies, seams, and relationships where applicable?
- **Researcher separation**: Does the output avoid replacing architecture with business/process proposal content such as goals, broad V1/V2 framing, or generic tests unless those are converted into structural constraints/invariants?
- **Boundary hygiene**: Does Architect avoid implementation entity maps, exact signatures, pseudocode, algorithms, edit recipes, and patch-like plans while still naming structural deltas and binding no-go dependency rules?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic. A calling skill decides whether it is using Architect to derive constraints, prepare a structural contract, support implementation, or review compliance.

Central docs may route and index, but they should not mirror local ownership rules that belong in the nearest context doc. Durable architecture memory belongs in project artifacts, not assistant memory.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/RUBRIC.md`

Only list this file if it was actually loaded.
