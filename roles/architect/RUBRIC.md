# Architect Rubric

Derived checklist for the Architect role. `ROLE.md` remains the canonical contract.

## Required body order

Architect output may include an optional short `summary`; the required body order is:

1. `constraints`
2. `forbidden_moves`
3. `invariants`
4. `boundaries_and_ownership`
5. `structural_entities`
6. `relationships`
7. `dependency_rules`
8. `required_artifacts`
9. `structural_risks`
10. `final_structural_contract`

## Checklist

- **Constraints first**: Are binding constraints stated before solution shape?
- **Forbidden moves**: Are prohibited changes explicit enough to prevent scope creep?
- **Invariants**: Are must-preserve behaviors, contracts, data rules, and architecture truths named?
- **Boundaries and ownership**: Are owning contexts/modules/seams/docs/tests clear?
- **Structural entities**: Are architecture-level modules, contexts, seams, adapters, records, boundaries, or domain structures named without confusing them with Researcher domain vocabulary or Planner implementation entities?
- **Relationships**: Are relationships among structural entities explicit?
- **Dependency rules**: Are allowed and forbidden dependency directions concrete enough for planning and review?
- **Required artifacts**: Is the architecture artifact decision one of `none`, `update_existing`, or `create_new`, with target artifacts named when required?
- **Structural risks**: Are coupling, boundary, naming, rollout, record, and contract risks concrete?
- **Final structural contract**: Is the handoff binding, concise, and ready for execution planning?
- **Clarifying questions**: If change surface, ownership, dependency direction, or done state is underspecified, did Architect ask architecture-relevant questions instead of guessing?
- **Architecture fit**: Does the contract match the intended shape of the system?
- **Change classification**: Is the slice local, design-level, architecture/structural, or mixed?
- **Collocation**: Are related entities, ports, adapters, and local rules kept with the owning context instead of pulled into a central mirror?
- **Seam hygiene**: Is each seam earned by real variation? Remember: one adapter is hypothetical; two adapters is real.
- **Depth**: Does the interface create leverage and locality, or is it shallow? Would the module survive the deletion test?
- **Balanced coupling**: Is coupling strength appropriate for architectural distance and volatility?
- **Test surface**: Are tests meant to exercise behavior through the interface instead of reaching past it?
- **DDD / language alignment**: Are names and relationships consistent with domain language and bounded contexts?
- **Dual-pass attack**: For architecture-sensitive work, did Architect B attack constraints, forbidden moves, invariants, boundaries, structural entities, relationships, dependency rules, required artifacts, risks, and final contract?
- **Boundary hygiene**: Does Architect avoid implementation entity maps, exact signatures, pseudocode, algorithms, edit recipes, and patch-like plans?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic. A calling skill decides whether it is using Architect to derive constraints, prepare a structural contract, support implementation, or review compliance.

Central docs may route and index, but they should not mirror local ownership rules that belong in the nearest context doc. Durable architecture memory belongs in project artifacts, not assistant memory.
