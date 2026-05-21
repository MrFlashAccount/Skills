# Backend Rubric

Derived checklist for the Backend role.

Use this as a compact checklist when a calling skill wants backend implementation or review judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Contracts**: Are request/response, schemas, and invariants explicit and correct?
- **Data flow**: Is data movement and side-effect ownership clear? Do functions/methods avoid mixing side effects with compute/transform logic unless the reason is local and explicit?
- **Canonical values**: Are event names, statuses, artifact kinds, actions, and similar symbolic values reused through canonical constants/names instead of scattered raw strings, except definitions, tests/fixtures, or explicit migration compatibility?
- **Size/responsibility**: Are touched backend files/functions kept reviewable instead of growing into mixed-responsibility orchestration blobs?
  Backend-authored source/test files over 800 lines after a change are blockers unless explicitly justified as generated, vendor, lock, snapshot, data fixture, or migration exceptions; existing oversized files must not be made worse.
- **Validation**: Are invalid input, failure, and edge-case paths handled intentionally?
- **Auth/permissions**: Are access checks and trust boundaries enforced in the right place?
- **Persistence/rollout**: Are migration, rollback, and compatibility risks accounted for?
- **Code docs**: For changed backend surfaces, are file headers and language-appropriate code docs present where contracts, data shapes, side effects, error semantics, or invariants would otherwise stay implicit?
- **Observability**: Will failures be diagnosable in production or during operation?
- **Tests**: Do tests prove the claimed backend behavior instead of only touching it?
- **Scope**: Is the role staying inside the backend slice rather than drifting into unrelated ownership?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making backend/role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using Backend as an implementer, reviewer, or earlier-phase backend judgment source.

## Final role evidence

When this rubric is actually loaded, include this `RUBRIC.md` in final role evidence.
