# Architect Rubric

Derived checklist for the Architect role.

Use this as a compact checklist when a calling skill wants architectural judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Architecture fit**: Does the change match the intended shape of the system?
- **Ownership clarity**: Are responsibilities concentrated in the right module or context?
- **Seam hygiene**: Is each seam earned by real variation, not hypothetical indirection?
- **Depth**: Does the interface create leverage and locality, or is it shallow?
- **DDD alignment**: Does the solution preserve bounded-context ownership and concept boundaries?
- **Ubiquitous language**: Are names and relationships consistent with the domain language?
- **Record updates**: Should architecture records be updated, such as `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, or repo-equivalent artifacts?
- **Anti-goals**: Does the change introduce accidental coupling, naming drift, or architecture-by-convenience?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using the Architect to derive constraints, verify compliance, or explore alternatives.
