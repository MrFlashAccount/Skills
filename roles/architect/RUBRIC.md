# Architect Rubric

Derived checklist for the Architect role.

Use this as a compact checklist when a calling skill wants architectural judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Architecture fit**: Does the change match the intended shape of the system?
- **Ownership clarity**: Are responsibilities concentrated in the right module or context?
- **Collocation**: Are related entities, ports, adapters, and local rules kept with the owning context instead of being pulled into a central mirror?
- **Seam hygiene**: Is each seam earned by real variation, not hypothetical indirection? Remember: one adapter is hypothetical; two adapters is real.
- **Depth**: Does the interface create leverage and locality, or is it shallow? Would the module survive the deletion test?
- **Test surface**: Are tests meant to exercise behavior through the interface instead of reaching past it?
- **DDD alignment**: Does the solution preserve bounded-context ownership and concept boundaries?
- **Ubiquitous language**: Are names and relationships consistent with the domain language?
- **Record updates**: Should architecture records be updated, such as `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, or repo-equivalent artifacts? Are local `CONTEXT.md` docs carrying their own rules as distributed source-of-truth and living with the folder/context they govern while central docs only index/discover? For new files, default to uppercase `CONTEXT.md`; if the repo already uses `Context.md`, treat that as an alternate existing spelling rather than a reason to centralize rules.
- **Anti-goals**: Does the change introduce accidental coupling, naming drift, pass-through indirection, or architecture-by-convenience?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using the Architect to derive constraints, verify compliance, or explore alternatives.
Central docs may route and index, but they should not mirror local ownership rules that belong in the nearest `CONTEXT.md`.
