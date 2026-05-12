# Security Rubric

Derived checklist for the Security role.

Use this as a compact checklist when a calling skill wants security judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Secrets and credentials**: Are secrets, tokens, and sensitive auth materials protected from exposure?
- **Auth and privilege boundaries**: Do auth/authz checks, trust boundaries, and privilege assumptions hold under abuse, not just happy path?
- **Input and parsing safety**: Can attacker-controlled input trigger injection, unsafe parsing, or execution risk?
- **External sends and exposure**: Does the slice leak or expose data across boundaries it should not cross?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides how to apply it in the current phase.
