# DevHarness Workflow

DevHarness is a workflow contract for staged work with explicit approvals.

Workers are isolated from orchestration state. A worker receives only a generated prompt assembled by the orchestrator and returns the requested artifact/status for that step. The worker never sees the workflow graph, baton, current node, or allowed transitions, and does not choose `next`, update `currentStep`, or advance any global node.

## Orchestrator contract

- Owns the workflow graph, baton, prompt assembly, approvals, and transition calls.
- Generates each worker prompt from the shared contract, role/step instructions, approved context, constraints, and expected output format.
- May inject approved artifacts as plain context, but not the baton object, workflow graph, allowed transitions, or current global node.
- Calls the transition helper after each worker or approval result.

## Worker contract

- Receives only the generated prompt for the assigned step.
- Produces only the requested artifact/status in the requested format.
- Reports blockers instead of inventing transitions.
- Does not decide the next step, current step, global status, or approvals.

## Transition helper contract

Input:

```yaml
transition_helper_input:
  workflow: "finite state machine definition"
  baton: "current baton"
  worker_output: "worker or approval result"
```

Validates:

- `baton` matches the expected workflow state shape.
- `worker_output` matches the output shape for the current step.
- The extracted outcome exists in `workflow`.
- The transition from the baton current step by that outcome is allowed.

Returns:

```yaml
transition_result:
  baton: "updated baton"
  next_step:
    id: null
    kind: null
    template: null
    inputs: []
    action: "generate_worker_prompt | wait_for_approval | stop_done | stop_blocked"
```

## Default flow

1. Research clarifies facts, constraints, risks, and open questions.
2. Sergey approves the research packet.
3. Architecture proposes the minimal approach and rejected alternative.
4. Sergey approves the architecture packet.
5. Implementation planning turns the approved context into a handoff.
6. Sergey approves the implementation plan.
7. Implementation makes only the approved changes.
8. Review checks the result against the approved plan and returns the final verdict.

## Recovery rules

- Resume from the baton, not from a worker's opinion about what should happen next.
- Verify repo, branch, approvals, and referenced artifacts before trusting the baton.
- Approval gates cannot be inferred; wait for explicit approval.
- If validation fails, keep the baton unchanged and stop with `blocker`.
- Keep artifacts compact enough to inject into the next generated prompt.
