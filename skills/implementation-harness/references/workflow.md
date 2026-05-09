# Workflow

## Routing

Choose implementers from the approved execution plan:

- `backend`: handlers, services, schemas, persistence, auth, jobs, backend tests.
- `frontend`: routes, components, styling, client state, UI data adapters, frontend tests.
- Use both only when the approved slice cleanly splits into non-overlapping zones.
- If routing is ambiguous, choose the safer single owner or stop as `blocked`.

## Execution

1. Read approved task context, approved research packet, and approved execution-plan packet.
   - treat them as closed input, not as a starting point for broad rediscovery
2. Map file zones to `backend` and/or `frontend` exactly as approved.
3. Implement only the approved slice and approved direction.
4. Run the smallest meaningful verification.
5. Package the development handoff for the separate review stage.
6. Return the output packet.

For non-trivial code work, make the loop explicit in execution notes and handoffs: `IMPLEMENT -> VALIDATE -> HANDOFF FOR REVIEW`.

## Verification rules

- Verification is mandatory before handoff.
- Implementer self-report is never sufficient to mark non-trivial code work done.
- Verification should check the changed code, the approved contract touchpoints, and any execution-time fact that could invalidate the handoff.
- Verification does not reopen broad task research or do a new readiness pass.
- If execution hits a concrete blocker, scope expansion is required, a contradiction appears, or an implementation-critical fact is still missing, stop as `blocked`.
- If verification fails, fix in scope and re-run verification before returning the packet.

## Handoff rule

This skill returns a development packet for the next stage.
Another layer or skill may open/update PRs, post issue comments, store artifacts, or run the explicit post-implementation review gate. Keep those actions out of this skill.
