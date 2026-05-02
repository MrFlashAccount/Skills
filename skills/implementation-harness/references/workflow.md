# Workflow

## Routing

Choose implementers from approved scope:

- `backend`: handlers, services, schemas, persistence, auth, jobs, backend tests.
- `frontend`: routes, components, styling, client state, UI data adapters, frontend tests.
- Use both only when the approved slice cleanly splits into non-overlapping zones.
- If routing is ambiguous, choose the safer single owner or stop as `blocked`.

## Execution

1. Read approved task context and research packet.
   - treat approved research as closed input, not as a starting point for broad rediscovery
2. Map file zones to `backend` and/or `frontend`.
3. Implement only the approved slice and approved research direction.
4. Run the smallest meaningful verification.
5. Run independent implementation-stage review.
6. Feed in-scope fixes back into implementation.
7. Repeat review/fix until clean, or stop after clear blockers.
8. Return the output packet.

## Review rules

- Review is mandatory.
- Implementer cannot review own slice.
- Review checks the code, verification, contradictions, and any missing implementation-critical facts that survived research; it does not reopen broad task research or do a new readiness pass.
- Use reviewer coverage that matches the slice:
  - backend-heavy changes: include backend correctness review
  - frontend-heavy changes: include frontend correctness review
  - security/privacy/reliability/performance review when the research packet or touched code says they matter
- If execution hits a concrete blocker, review finds scope expansion, a redesign is required, a contradiction appears, or an implementation-critical fact is still missing, stop as `blocked`.

## Handoff rule

This skill returns a packet. Another layer may open/update PRs, post issue comments, store artifacts, or resume later. Keep those actions out of this skill.
