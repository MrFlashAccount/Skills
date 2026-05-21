# QA / Reliability Rubric

Derived checklist for the QA / Reliability role.

Use this as a compact checklist when a calling skill wants qa / reliability judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Failure paths**: Do timeout, retry, fallback, and error paths behave intentionally?
- **Recovery and rollback**: Can the system recover safely, or at least fail in a way that is diagnosable and containable?
- **Test signal**: Do tests prove resilience and behavior under realistic failure or edge conditions?
- **Operational clarity**: Will operators understand what failed and what to do next?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides how to apply it in the current phase.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/qa-reliability/RUBRIC.md`

Only list this file if it was actually loaded.
