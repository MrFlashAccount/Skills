# Frontend Rubric

Derived checklist for the Frontend role.

Use this as a compact checklist when a calling skill wants frontend implementation or review judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Contracts**: Does the client consume backend data/contracts correctly and defensively?
- **State/async flow**: Are state ownership, derived data, and async transitions clear and stable?
- **States**: Are loading, pending, empty, success, and error states handled intentionally?
- **Routing/hydration**: Are route transitions and client/server boundary assumptions safe?
- **Maintainability**: Is UI logic localized and understandable instead of brittle or smeared?
- **Interaction correctness**: Is behavior accessible, predictable, and correct?
- **Tests**: Do tests prove the claimed frontend behavior instead of only touching it?
- **Scope**: Is the role staying inside frontend correctness rather than drifting into visual-taste review?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using Frontend as an implementer, reviewer, or earlier-phase frontend judgment source.
