# Workflow

## Routing

Choose implementers from approved scope:

- `backend`: handlers, services, schemas, persistence, auth, jobs, backend tests.
- `frontend`: routes, components, styling, client state, UI data adapters, frontend tests.
- Use both only when the approved slice cleanly splits into non-overlapping zones.
- If routing is ambiguous, choose the safer single owner or stop as `blocked`.

## Execution

1. Read approved task context and research packet.
2. Map file zones to `backend` and/or `frontend`.
3. Implement only the approved slice.
4. Run the smallest meaningful verification.
5. Run independent review.
6. Feed in-scope fixes back into implementation.
7. Repeat review/fix until clean, or stop after clear blockers.
8. Return the output packet.

## Review rules

- Review is mandatory.
- Implementer cannot review own slice.
- Use reviewer coverage that matches the slice:
  - backend-heavy changes: include backend correctness review
  - frontend-heavy changes: include frontend correctness review
  - security/privacy/reliability/performance review when the research packet or touched code says they matter
- If review finds scope expansion, redesign pressure, or unresolved contradiction, stop as `blocked`.

## Handoff rule

This skill returns a packet. Another layer may open/update PRs, post issue comments, store artifacts, or resume later. Keep those actions out of this skill.
