# Backend Rubric

Derived checklist for the Backend role.

Use this as a compact checklist when a calling skill wants backend implementation or review judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Contracts**: Are request/response, schemas, and invariants explicit and correct?
- **Data flow**: Is data movement and side-effect ownership clear?
- **Validation**: Are invalid input, failure, and edge-case paths handled intentionally?
- **Auth/permissions**: Are access checks and trust boundaries enforced in the right place?
- **Persistence/rollout**: Are migration, rollback, and compatibility risks accounted for?
- **Observability**: Will failures be diagnosable in production or during operation?
- **Tests**: Do tests prove the claimed backend behavior instead of only touching it?
- **Scope**: Is the role staying inside the backend slice rather than drifting into unrelated ownership?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making backend judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using Backend as an implementer, reviewer, or earlier-phase backend judgment source.
