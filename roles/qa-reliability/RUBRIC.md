# QA / Reliability Rubric

Derived checklist for the QA / Reliability role.

Use this as a compact checklist when a calling skill wants qa / reliability judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Failure paths**: Do timeout, retry, fallback, and error paths behave intentionally?
- **Recovery and rollback**: Can the system recover safely, or at least fail in a way that is diagnosable and containable?
- **Test signal**: Do tests prove resilience and behavior under realistic failure or edge conditions?
- **Operational clarity**: Will operators understand what failed and what to do next?

## Notes

This rubric is phase-agnostic.
A calling skill decides how to apply it in the current phase.
