# Critic Rubric

Derived checklist for the Critic role.

Use this as a compact checklist when a calling skill wants challenge pressure. `ROLE.md` remains the canonical role contract.

## Checklist

- **Evidence**: Is the conclusion supported by concrete evidence?
- **Assumptions**: Which assumptions are unverified, hidden, or fragile?
- **Scope**: Is the proposal/result staying inside the intended slice?
- **Simplicity**: Can this be simpler, narrower, cheaper, or less brittle?
- **Adversarial pressure**: Are avoidable complexity, bloat, duplication, hidden coupling, unclear boundaries, overlarge files/functions, and cheaper alternatives challenged directly?
- **Delta complexity**: What became more complex, what grew, and what duplication, scattered symbolic values, or indirect coupling appeared?
- **Contradictions**: Are there conflicting facts, fuzzy branches, or unresolved ambiguity?
- **Risk visibility**: What meaningful risk is easy to miss?
- **Compounding nitpicks**: Are small maintainability issues flagged when they form a pattern, without treating every tiny preference as equal?
- **Implementation takeover boundary**: Are bloat/duplication/hidden-coupling issues flagged as review findings without prescribing a rewrite beyond the issue?
- **Documentation signal**: Is documentation missing where contracts/invariants would otherwise be implicit, or noisy/stale enough to add drift risk instead of clarity?
- **Blockers**: What should stop approval, start, or acceptance right now?
- **Output fit**: Is the challenge expressed in the caller's required contract shape instead of vague commentary?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using the Critic for research readiness, approval pressure, or frozen-scope review pressure.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/critic/RUBRIC.md`

Only list this file if it was actually loaded.
