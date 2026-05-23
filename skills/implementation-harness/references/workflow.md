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
3. Stay in orchestrator mode: do not implement inside the parent session. Spawn delegated implementer worker/subagent owner(s) for the approved file zones even when direct manual execution in the parent session would be faster or more convenient.
   - if the required implementer worker/subagent path is unavailable, fails to start, or cannot be used, stop as `blocked` instead of implementing manually in the parent session
   - role label alone is not enough: include the role invocation material from `../../../shared/templates/role-invocation-template.md`, filled with the shared delegated role task template from `../../../shared/delegate/delegated-role-task-template.md`, the selected role material path, compact implementer focus from `../../dev-harness/references/roles/implementers.md`, and the concrete approved task packet/scope/verification expectations
4. Implement only the approved slice and approved direction through those delegated implementer worker/subagent owner(s).
5. Run the smallest meaningful verification.
6. Package the development handoff for the separate review stage.
7. Return the output packet.

For non-trivial code work, make the loop explicit in execution notes and handoffs: `IMPLEMENT -> VALIDATE -> HANDOFF FOR REVIEW`.

## Verification rules

- Verification is mandatory before handoff.
- Implementer self-report is never sufficient to mark non-trivial code work done.
- Required role material must be loaded before acceptance. If required material cannot be loaded or loaded role material's additional, final-answer, or output requirements cannot be satisfied, treat that owner output as `blocked` and do not hand the slice to review as complete.
- Parent-session convenience is never a valid reason to bypass delegated implementation when this harness applies.
- Delegate failure or unavailability is not a license to bypass the harness; if required implementer delegation cannot run, stop as `blocked`.
- Verification should check the changed code, the approved contract touchpoints, and any execution-time fact that could invalidate the handoff.
- Verification does not reopen broad task research or do a new readiness pass.
- If execution hits a concrete blocker, scope expansion is required, a contradiction appears, or an implementation-critical fact is still missing, stop as `blocked`.
- If verification fails, fix in scope and re-run verification before returning the packet.

## Handoff rule

This skill returns a development packet for the next stage.
Another layer or skill may open/update PRs, post issue comments, store artifacts, or run the explicit post-implementation review gate. Keep those actions out of this skill.
