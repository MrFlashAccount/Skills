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
7. After every in-scope fix pass, re-run verification before re-review. Do not send changed code to re-review or manual review on stale validation.
8. Return the output packet.

For non-trivial code work, make the loop explicit in execution notes and handoffs: `IMPLEMENT -> VALIDATE -> REVIEW -> FIX -> RE-VALIDATE -> RE-REVIEW`.

## Review rules

- Review is mandatory.
- Implementer cannot review own slice.
- Implementer self-report is never sufficient to mark non-trivial code work done.
- Review checks the code, verification, contradictions, and any missing implementation-critical facts that survived research; it does not reopen broad task research or do a new readiness pass.
- For non-trivial code work, review is adversarial against the approved contract and must return a binary pass/fail outcome, not just advisory notes.
- Use reviewer coverage that matches the slice:
  - backend-heavy changes: include backend correctness review
  - frontend-heavy changes: include frontend correctness review
  - security/privacy/reliability/performance review when the research packet or touched code says they matter
- If execution hits a concrete blocker, review finds scope expansion, a redesign is required, a contradiction appears, or an implementation-critical fact is still missing, stop as `blocked`.
- After an in-scope fix pass, prefer a fresh independent reviewer for re-review by default. Reuse the same reviewer only when reviewer availability is constrained and the slice stayed within frozen scope; record that fallback under `review_gate.freshness_notes`.

## Handoff rule

This skill returns a packet. Another layer may open/update PRs, post issue comments, store artifacts, or resume later. Keep those actions out of this skill.
